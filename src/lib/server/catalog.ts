import { PRODUCTS_PER_PAGE, SIZE_ORDER, type SortOption } from '$lib/config';
import type { SearchDoc } from '$lib/search';
import type {
	CatalogFacets,
	CategoryCard,
	CategoryLink,
	ProductCard,
	ProductDetail
} from '$lib/types';
import type { Prisma } from '../../../prisma/generated/client.js';
import { db } from './db.js';

/**
 * Читання каталогу. Тут — єдине місце, де сторінки торкаються таблиць
 * Product / Category. Назовні віддаються view-моделі з `$lib/types`.
 */

export type CatalogFilters = {
	categorySlug?: string;
	sizes?: string[];
	colors?: string[];
	query?: string;
	/** Тільки товари зі знижкою. */
	sale?: boolean;
	sort?: SortOption;
	page?: number;
	/**
	 * Товари, які знайшов пошук, у порядку доречності. Якщо він заданий,
	 * `query` уже відпрацьований — фільтрувати по тексту повторно не треба.
	 */
	ids?: string[];
};

/**
 * Що взагалі можна показувати покупцеві.
 *
 * Товар живий, якщо його не вимкнули в CRM і є хоч один увімкнений варіант
 * із залишком. Розібрали останній розмір — товар зникає зі списків сам,
 * без жодної ручної дії менеджера.
 */
export const AVAILABLE_VARIANT = { isActive: true, stock: { gt: 0 } } as const;

export const VISIBLE_PRODUCT = {
	isActive: true,
	variants: { some: AVAILABLE_VARIANT }
} satisfies Prisma.ProductWhereInput;

const CARD_SELECT = {
	id: true,
	slug: true,
	name: true,
	price: true,
	finalPrice: true,
	// Два фото: перше — обкладинка, друге проявляється при наведенні.
	images: { select: { url: true, alt: true }, orderBy: { position: 'asc' }, take: 2 },
	variants: { where: AVAILABLE_VARIANT, select: { color: true, stock: true } }
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof CARD_SELECT }>;

function toCard(row: CardRow): ProductCard {
	const [image, hoverImage] = row.images;
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		price: row.finalPrice,
		// Стару ціну показуємо тільки тоді, коли знижка справді діє.
		compareAt: row.finalPrice < row.price ? row.price : null,
		image: image ? { url: image.url, alt: image.alt ?? row.name } : null,
		hoverImage: hoverImage ? { url: hoverImage.url, alt: hoverImage.alt ?? row.name } : null,
		colors: [...new Set(row.variants.map((variant) => variant.color))],
		inStock: row.variants.length > 0
	};
}

function orderBy(sort: SortOption = 'new'): Prisma.ProductOrderByWithRelationInput {
	// Сортуємо за ціною до сплати — інакше товар зі знижкою стояв би не там,
	// де його бачить покупець.
	if (sort === 'price-asc') return { finalPrice: 'asc' };
	if (sort === 'price-desc') return { finalPrice: 'desc' };
	return { createdAt: 'desc' };
}

function buildWhere(filters: CatalogFilters): Prisma.ProductWhereInput {
	const { categorySlug, sizes, colors, query, sale, ids } = filters;

	// Розмір і колір фільтруються по варіантах: товар підходить, якщо
	// існує хоч один доступний варіант, що задовольняє всі обрані умови
	// одночасно. Розмір, якого немає на складі, не має «знаходити» товар.
	const variantConditions: Prisma.ProductVariantWhereInput = { ...AVAILABLE_VARIANT };
	if (sizes?.length) variantConditions.size = { in: sizes };
	if (colors?.length) variantConditions.color = { in: colors };

	const search = query?.trim();

	return {
		isActive: true,
		variants: { some: variantConditions },
		...(categorySlug ? { category: { slug: categorySlug } } : {}),
		// Порівняння двох колонок — через field reference, а не сирий SQL.
		...(sale ? { finalPrice: { lt: db.product.fields.price } } : {}),
		// Пошук уже вибрав товари — його список точніший за `contains`
		// по назві, тож текстову умову тут не дублюємо.
		...(ids ? { id: { in: ids } } : {}),
		...(!ids && search
			? {
					OR: [
						{ name: { contains: search, mode: 'insensitive' as const } },
						{ description: { contains: search, mode: 'insensitive' as const } }
					]
				}
			: {})
	};
}

export async function listCategories(): Promise<CategoryLink[]> {
	const rows = await db.category.findMany({
		orderBy: [{ position: 'asc' }, { name: 'asc' }],
		select: {
			slug: true,
			name: true,
			_count: { select: { products: { where: VISIBLE_PRODUCT } } }
		}
	});

	return rows.map((row) => ({
		slug: row.slug,
		name: row.name,
		productCount: row._count.products
	}));
}

/**
 * Вітрина категорій на /catalog.
 *
 * Фото категорії лежить у самій категорії (`Category.imageUrl`) — сюди воно
 * тільки віддається. Порожні категорії не показуємо: клікати в них немає сенсу.
 */
export async function listCategoryCards(): Promise<CategoryCard[]> {
	const rows = await db.category.findMany({
		orderBy: [{ position: 'asc' }, { name: 'asc' }],
		select: {
			slug: true,
			name: true,
			imageUrl: true,
			_count: { select: { products: { where: VISIBLE_PRODUCT } } }
		}
	});

	return rows
		.filter((row) => row._count.products > 0)
		.map((row) => ({
			slug: row.slug,
			name: row.name,
			productCount: row._count.products,
			imageUrl: row.imageUrl
		}));
}

export async function getCategory(slug: string) {
	return db.category.findUnique({
		where: { slug },
		select: { slug: true, name: true, imageUrl: true }
	});
}

const EMPTY_PAGE = { items: [] as ProductCard[], total: 0, page: 1, pageCount: 1 };

export async function listProducts(filters: CatalogFilters) {
	const page = Math.max(1, filters.page ?? 1);
	if (filters.ids?.length === 0) return EMPTY_PAGE;

	const where = buildWhere(filters);

	// Порядок доречності не виражається в SQL, тож при пошуку сторінку
	// відрізаємо в пам'яті. Вибірка обмежена знайденим, а не всім
	// каталогом, тож це дешево. Явне сортування за ціною важливіше за
	// доречність — його покупець обрав руками.
	if (filters.ids && filters.sort !== 'price-asc' && filters.sort !== 'price-desc') {
		const rows = await db.product.findMany({ where, select: CARD_SELECT });
		const rank = new Map(filters.ids.map((id, position) => [id, position]));
		rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

		const from = (page - 1) * PRODUCTS_PER_PAGE;
		return {
			items: rows.slice(from, from + PRODUCTS_PER_PAGE).map(toCard),
			total: rows.length,
			page,
			pageCount: Math.max(1, Math.ceil(rows.length / PRODUCTS_PER_PAGE))
		};
	}

	const [rows, total] = await Promise.all([
		db.product.findMany({
			where,
			select: CARD_SELECT,
			orderBy: orderBy(filters.sort),
			skip: (page - 1) * PRODUCTS_PER_PAGE,
			take: PRODUCTS_PER_PAGE
		}),
		db.product.count({ where })
	]);

	return {
		items: rows.map(toCard),
		total,
		page,
		pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE))
	};
}

export async function listFeatured(limit = 8): Promise<ProductCard[]> {
	const rows = await db.product.findMany({
		where: { ...VISIBLE_PRODUCT, isFeatured: true },
		select: CARD_SELECT,
		orderBy: { createdAt: 'desc' },
		take: limit
	});
	return rows.map(toCard);
}

/** Товари зі знижкою — для промо-банера і сторінки розпродажу. */
export async function listSale(limit = 4): Promise<ProductCard[]> {
	const rows = await db.product.findMany({
		// Знижка діє, коли ціна до сплати нижча за базову. Порівняння двох
		// колонок — через field reference, а не сирий SQL.
		where: { ...VISIBLE_PRODUCT, finalPrice: { lt: db.product.fields.price } },
		select: CARD_SELECT,
		orderBy: { createdAt: 'desc' },
		take: limit
	});
	return rows.map(toCard);
}

export async function listNewArrivals(limit = 4): Promise<ProductCard[]> {
	const rows = await db.product.findMany({
		where: VISIBLE_PRODUCT,
		select: CARD_SELECT,
		orderBy: { createdAt: 'desc' },
		take: limit
	});
	return rows.map(toCard);
}

/**
 * Товари однієї категорії — стрічка на головній.
 *
 * Порядок той самий, що й у каталозі за замовчуванням (спершу свіже), тож
 * покупець бачить на головній початок тієї ж полиці, на яку веде посилання
 * «Уся категорія».
 */
export async function listCategoryProducts(slug: string, limit: number): Promise<ProductCard[]> {
	const rows = await db.product.findMany({
		where: { ...VISIBLE_PRODUCT, category: { slug } },
		select: CARD_SELECT,
		orderBy: { createdAt: 'desc' },
		take: limit
	});
	return rows.map(toCard);
}

/** Картка товару плюс текст, по якому його шукають. */
export type SearchRow = { card: ProductCard; doc: SearchDoc };

/**
 * Увесь живий каталог одним запитом — сировина для покажчика пошуку.
 *
 * Пошук не ходить у базу на кожну натиснуту літеру: цей список читається
 * раз і живе в пам'яті (`$lib/server/search`). Тому тут немає ні `take`,
 * ні фільтрів — покажчик має бачити все, що можна купити.
 */
export async function listSearchRows(): Promise<SearchRow[]> {
	const rows = await db.product.findMany({
		where: VISIBLE_PRODUCT,
		select: {
			...CARD_SELECT,
			description: true,
			category: { select: { name: true } },
			variants: { where: AVAILABLE_VARIANT, select: { color: true, stock: true, sku: true } }
		},
		// Порядок тут — лише запасний: видачу впорядковує вага збігу.
		orderBy: { createdAt: 'desc' }
	});

	return rows.map((row) => ({
		card: toCard(row),
		doc: {
			name: row.name,
			category: row.category.name,
			colors: [...new Set(row.variants.map((variant) => variant.color))],
			skus: row.variants.map((variant) => variant.sku),
			description: row.description
		}
	}));
}

/** Доступні розміри й кольори в межах категорії — для панелі фільтрів. */
export async function listFacets(categorySlug?: string): Promise<CatalogFacets> {
	const rows = await db.productVariant.findMany({
		where: {
			// Фільтр пропонує тільки те, що реально можна купити.
			...AVAILABLE_VARIANT,
			product: {
				isActive: true,
				...(categorySlug ? { category: { slug: categorySlug } } : {})
			}
		},
		select: { size: true, color: true, colorHex: true },
		distinct: ['size', 'color']
	});

	const sizeOrder = SIZE_ORDER as readonly string[];
	const sizes = [...new Set(rows.map((row) => row.size))].sort((a, b) => {
		const indexA = sizeOrder.indexOf(a);
		const indexB = sizeOrder.indexOf(b);
		// Нестандартні розміри (напр. "One size") їдуть у кінець списку.
		if (indexA === -1 || indexB === -1)
			return indexA === indexB ? a.localeCompare(b) : indexB - indexA;
		return indexA - indexB;
	});

	const colors = new Map<string, string | null>();
	for (const row of rows) {
		if (!colors.has(row.color)) colors.set(row.color, row.colorHex);
	}

	return {
		sizes,
		colors: [...colors]
			.map(([name, hex]) => ({ name, hex }))
			.sort((a, b) => a.name.localeCompare(b.name))
	};
}

/**
 * Сторінка товару.
 *
 * Вимкнений у CRM товар не відкривається взагалі (404). Розпроданий —
 * відкривається, але без варіантів: сторінка лишається за старим посиланням,
 * а купити нічого не можна. Так не ламаються збережені посилання й видача.
 */
/**
 * Усе, що має потрапити в sitemap.xml: сторінки товарів і категорій.
 * Дата зміни береться з БД — Google бачить, що оновилось, і перезаходить.
 */
export async function listSitemapEntries() {
	const [products, categories] = await Promise.all([
		db.product.findMany({
			where: VISIBLE_PRODUCT,
			select: { slug: true, updatedAt: true },
			orderBy: { updatedAt: 'desc' }
		}),
		db.category.findMany({
			where: { products: { some: VISIBLE_PRODUCT } },
			select: { slug: true, updatedAt: true },
			orderBy: [{ position: 'asc' }, { name: 'asc' }]
		})
	]);

	return { products, categories };
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
	const row = await db.product.findFirst({
		where: { slug, isActive: true },
		select: {
			id: true,
			slug: true,
			name: true,
			description: true,
			price: true,
			finalPrice: true,
			category: { select: { slug: true, name: true } },
			images: { select: { url: true, alt: true, color: true }, orderBy: { position: 'asc' } },
			attributes: {
				select: { name: true, value: true },
				orderBy: [{ position: 'asc' }, { name: 'asc' }]
			},
			// Порядок рядків задає CRM: розміри бувають які завгодно
			// («S/M», «4ХL»), і вгадувати їх послідовність тут нічим.
			measurements: {
				select: { size: true, ua: true, chest: true, sleeve: true, length: true },
				orderBy: [{ position: 'asc' }, { size: 'asc' }]
			},
			variants: {
				where: AVAILABLE_VARIANT,
				select: {
					id: true,
					sku: true,
					size: true,
					color: true,
					colorHex: true,
					finalPrice: true,
					stock: true
				},
				orderBy: [{ color: 'asc' }, { size: 'asc' }]
			}
		}
	});

	if (!row) return null;

	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		price: row.finalPrice,
		compareAt: row.finalPrice < row.price ? row.price : null,
		category: row.category,
		images: row.images.map((image) => ({
			url: image.url,
			alt: image.alt ?? row.name,
			color: image.color
		})),
		// Порожнє поле в CRM — це «не заповнили», а не характеристика без
		// значення: такі рядки до сторінки не доїжджають.
		attributes: row.attributes
			.map((attribute) => ({ name: attribute.name.trim(), value: attribute.value.trim() }))
			.filter((attribute) => attribute.name !== '' && attribute.value !== ''),
		measurements: row.measurements,
		variants: row.variants.map((variant) => ({
			id: variant.id,
			sku: variant.sku,
			size: variant.size,
			color: variant.color,
			colorHex: variant.colorHex,
			// Варіант може мати власну ціну; якщо ні — успадковує ціну товару.
			price: variant.finalPrice ?? row.finalPrice,
			stock: variant.stock
		}))
	};
}

/**
 * Рекомендації «Вам також сподобається».
 *
 * Content-based скоринг: беремо обмежений пул кандидатів і ранжуємо їх за
 * схожістю на переглянутий товар. Ваги підібрані під логіку покупця одягу —
 * спершу той самий тип речі, потім сумісність за кольором і розміром,
 * і тільки потім ціновий сегмент.
 *
 * Свідомо без матриці «купували разом»: поки немає історії замовлень,
 * колаборативна фільтрація видавала б шум. Коли статистика набереться,
 * її можна додати ще одним доданком до score, не змінюючи інтерфейс функції.
 */
const RECOMMENDATION_WEIGHTS = {
	sameCategory: 40,
	/** За кожен спільний колір, але не більше стелі. */
	colorMatch: 12,
	colorMatchCap: 24,
	/** Розмір покупця є в наявності — головний блокер покупки. */
	sizeInStock: 14,
	/** Максимум за повний збіг цінового сегмента. */
	priceProximity: 25,
	hasDiscount: 8,
	featured: 6
} as const;

const RECOMMENDATION_POOL = 60;

export async function listRecommended(product: ProductDetail, limit = 4): Promise<ProductCard[]> {
	const rows = await db.product.findMany({
		// Радити те, чого немає на складі, немає сенсу — такі товари
		// відсіюються ще в запиті, а не штрафом у скорингу.
		where: { ...VISIBLE_PRODUCT, id: { not: product.id } },
		select: {
			...CARD_SELECT,
			isFeatured: true,
			category: { select: { slug: true } },
			variants: { where: AVAILABLE_VARIANT, select: { color: true, size: true, stock: true } }
		},
		// Пул обмежений: ранжувати всю базу в пам'яті не потрібно й дорого.
		orderBy: { createdAt: 'desc' },
		take: RECOMMENDATION_POOL
	});

	const sourceColors = new Set(product.variants.map((variant) => variant.color));
	const sourceSizes = new Set(
		product.variants.filter((variant) => variant.stock > 0).map((variant) => variant.size)
	);

	const scored = rows.map((row) => {
		let score = 0;

		if (row.category.slug === product.category.slug) {
			score += RECOMMENDATION_WEIGHTS.sameCategory;
		}

		const candidateColors = new Set(row.variants.map((variant) => variant.color));
		const sharedColors = [...candidateColors].filter((color) => sourceColors.has(color)).length;
		score += Math.min(
			sharedColors * RECOMMENDATION_WEIGHTS.colorMatch,
			RECOMMENDATION_WEIGHTS.colorMatchCap
		);

		const hasMatchingSize = row.variants.some((variant) => sourceSizes.has(variant.size));
		if (hasMatchingSize) score += RECOMMENDATION_WEIGHTS.sizeInStock;

		// Ціна: чим ближчий сегмент, тим вищий бал. Різниця нормується
		// на більшу з двох цін, тож шкала однакова для 500 і 5000 грн.
		const priceGap = Math.abs(row.finalPrice - product.price);
		const priceScale = Math.max(row.finalPrice, product.price, 1);
		score += RECOMMENDATION_WEIGHTS.priceProximity * (1 - Math.min(1, priceGap / priceScale));

		if (row.finalPrice < row.price) {
			score += RECOMMENDATION_WEIGHTS.hasDiscount;
		}
		if (row.isFeatured) score += RECOMMENDATION_WEIGHTS.featured;

		return { row, score };
	});

	return scored
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((entry) => toCard(entry.row));
}
