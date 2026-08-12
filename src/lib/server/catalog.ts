import { PRODUCTS_PER_PAGE, SIZE_ORDER, type SortOption } from '$lib/config';
import type { CatalogFacets, CategoryLink, ProductCard, ProductDetail } from '$lib/types';
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
};

const CARD_SELECT = {
	id: true,
	slug: true,
	name: true,
	price: true,
	compareAt: true,
	images: { select: { url: true, alt: true }, orderBy: { position: 'asc' }, take: 1 },
	variants: { select: { color: true, stock: true } }
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof CARD_SELECT }>;

function toCard(row: CardRow): ProductCard {
	const image = row.images[0];
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		price: row.price,
		compareAt: row.compareAt,
		image: image ? { url: image.url, alt: image.alt ?? row.name } : null,
		colors: [...new Set(row.variants.map((variant) => variant.color))],
		inStock: row.variants.some((variant) => variant.stock > 0)
	};
}

function orderBy(sort: SortOption = 'new'): Prisma.ProductOrderByWithRelationInput {
	if (sort === 'price-asc') return { price: 'asc' };
	if (sort === 'price-desc') return { price: 'desc' };
	return { createdAt: 'desc' };
}

function buildWhere(filters: CatalogFilters): Prisma.ProductWhereInput {
	const { categorySlug, sizes, colors, query, sale } = filters;

	// Розмір і колір фільтруються по варіантах: товар підходить, якщо
	// існує хоч один варіант, що задовольняє всі обрані умови одночасно.
	const variantConditions: Prisma.ProductVariantWhereInput = {};
	if (sizes?.length) variantConditions.size = { in: sizes };
	if (colors?.length) variantConditions.color = { in: colors };

	const search = query?.trim();

	return {
		isActive: true,
		...(categorySlug ? { category: { slug: categorySlug } } : {}),
		...(Object.keys(variantConditions).length ? { variants: { some: variantConditions } } : {}),
		// Порівняння двох колонок — через field reference, а не сирий SQL.
		...(sale ? { compareAt: { gt: db.product.fields.price } } : {}),
		...(search
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
			_count: { select: { products: { where: { isActive: true } } } }
		}
	});

	return rows.map((row) => ({
		slug: row.slug,
		name: row.name,
		productCount: row._count.products
	}));
}

export async function getCategory(slug: string) {
	return db.category.findUnique({
		where: { slug },
		select: { slug: true, name: true, imageUrl: true }
	});
}

export async function listProducts(filters: CatalogFilters) {
	const page = Math.max(1, filters.page ?? 1);
	const where = buildWhere(filters);

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
		where: { isActive: true, isFeatured: true },
		select: CARD_SELECT,
		orderBy: { createdAt: 'desc' },
		take: limit
	});
	return rows.map(toCard);
}

/** Товари зі знижкою — для промо-банера і сторінки розпродажу. */
export async function listSale(limit = 4): Promise<ProductCard[]> {
	const rows = await db.product.findMany({
		where: { isActive: true, compareAt: { gt: db.product.fields.price } },
		select: CARD_SELECT,
		orderBy: { createdAt: 'desc' },
		take: limit
	});
	return rows.map(toCard);
}

export async function listNewArrivals(limit = 4): Promise<ProductCard[]> {
	const rows = await db.product.findMany({
		where: { isActive: true },
		select: CARD_SELECT,
		orderBy: { createdAt: 'desc' },
		take: limit
	});
	return rows.map(toCard);
}

/** Доступні розміри й кольори в межах категорії — для панелі фільтрів. */
export async function listFacets(categorySlug?: string): Promise<CatalogFacets> {
	const rows = await db.productVariant.findMany({
		where: {
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

export async function getProduct(slug: string): Promise<ProductDetail | null> {
	const row = await db.product.findFirst({
		where: { slug, isActive: true },
		select: {
			id: true,
			slug: true,
			name: true,
			description: true,
			price: true,
			compareAt: true,
			category: { select: { slug: true, name: true } },
			images: { select: { url: true, alt: true }, orderBy: { position: 'asc' } },
			variants: {
				select: { id: true, size: true, color: true, colorHex: true, price: true, stock: true },
				orderBy: [{ color: 'asc' }, { size: 'asc' }]
			}
		}
	});

	if (!row) return null;

	return {
		...row,
		images: row.images.map((image) => ({ url: image.url, alt: image.alt ?? row.name })),
		variants: row.variants.map((variant) => ({
			...variant,
			// Варіант може мати власну ціну; якщо ні — успадковує базову.
			price: variant.price ?? row.price
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
	featured: 6,
	outOfStock: -60
} as const;

const RECOMMENDATION_POOL = 60;

export async function listRecommended(product: ProductDetail, limit = 4): Promise<ProductCard[]> {
	const rows = await db.product.findMany({
		where: { isActive: true, id: { not: product.id } },
		select: {
			...CARD_SELECT,
			isFeatured: true,
			category: { select: { slug: true } },
			variants: { select: { color: true, size: true, stock: true } }
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

		const hasMatchingSize = row.variants.some(
			(variant) => variant.stock > 0 && sourceSizes.has(variant.size)
		);
		if (hasMatchingSize) score += RECOMMENDATION_WEIGHTS.sizeInStock;

		// Ціна: чим ближчий сегмент, тим вищий бал. Різниця нормується
		// на більшу з двох цін, тож шкала однакова для 500 і 5000 грн.
		const priceGap = Math.abs(row.price - product.price);
		const priceScale = Math.max(row.price, product.price, 1);
		score += RECOMMENDATION_WEIGHTS.priceProximity * (1 - Math.min(1, priceGap / priceScale));

		if (row.compareAt && row.compareAt > row.price) {
			score += RECOMMENDATION_WEIGHTS.hasDiscount;
		}
		if (row.isFeatured) score += RECOMMENDATION_WEIGHTS.featured;
		if (!row.variants.some((variant) => variant.stock > 0)) {
			score += RECOMMENDATION_WEIGHTS.outOfStock;
		}

		return { row, score };
	});

	return scored
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((entry) => toCard(entry.row));
}
