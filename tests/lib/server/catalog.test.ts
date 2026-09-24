import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Каталог — вітрина для CRM: ціни зі знижкою рахує база, а сайт лише показує
 * те, що можна купити. Тут перевіряємо саме ці два правила.
 */

const db = {
	category: { findMany: vi.fn() },
	product: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), fields: { price: 'price' } },
	productVariant: { findMany: vi.fn() }
};

vi.mock('$lib/server/db', () => ({ db }));

const {
	getProduct,
	listCategories,
	listCategoryCards,
	listCategoryProducts,
	listCollection,
	listProducts,
	listSale
} = await import('$lib/server/catalog');

/** Рядок товару в тому вигляді, в якому його віддає Prisma. */
const row = (patch: Record<string, unknown> = {}) => ({
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сукня Olivia',
	price: 299_900,
	finalPrice: 219_900,
	images: [
		{ url: 'https://example.test/1.jpg', alt: null, color: null },
		{ url: 'https://example.test/2.jpg', alt: 'ззаду', color: null }
	],
	variants: [{ color: 'Чорний', stock: 3 }],
	attributes: [],
	...patch
});

const category = (patch: Record<string, unknown> = {}) => ({
	slug: 'sukni',
	name: 'Сукні',
	imageUrl: 'https://example.test/sukni.jpg',
	_count: { products: 4 },
	...patch
});

beforeEach(() => {
	db.category.findMany.mockReset();
	db.product.findMany.mockReset();
	db.product.count.mockReset();
	db.product.findFirst.mockReset();
});

describe('ціни в каталозі', () => {
	it('показує ціну зі знижкою, а базову закреслює', async () => {
		db.product.findMany.mockResolvedValue([row()]);
		db.product.count.mockResolvedValue(1);

		const [card] = (await listProducts({})).items;

		expect(card.price).toBe(219_900);
		expect(card.compareAt).toBe(299_900);
	});

	it('без знижки старої ціни немає', async () => {
		db.product.findMany.mockResolvedValue([row({ finalPrice: 299_900 })]);
		db.product.count.mockResolvedValue(1);

		expect((await listProducts({})).items[0].compareAt).toBeNull();
	});

	it('сортує за ціною до сплати, а не за базовою', async () => {
		db.product.findMany.mockResolvedValue([]);
		db.product.count.mockResolvedValue(0);

		await listProducts({ sort: 'price-asc' });

		expect(db.product.findMany.mock.calls[0][0].orderBy).toEqual({ finalPrice: 'asc' });
	});

	it('фільтр «Знижки» порівнює дві колонки, а не число', async () => {
		db.product.findMany.mockResolvedValue([]);
		db.product.count.mockResolvedValue(0);

		await listProducts({ sale: true });

		expect(db.product.findMany.mock.calls[0][0].where.finalPrice).toEqual({ lt: 'price' });
	});

	it('промо-добірка знижок бере тільки те, що є в наявності', async () => {
		db.product.findMany.mockResolvedValue([]);

		await listSale();

		const where = db.product.findMany.mock.calls[0][0].where;
		expect(where.finalPrice).toEqual({ lt: 'price' });
		expect(where.variants).toEqual({ some: { isActive: true, stock: { gt: 0 } } });
	});
});

describe('наявність', () => {
	it('у списки потрапляє лише те, що можна купити', async () => {
		db.product.findMany.mockResolvedValue([]);
		db.product.count.mockResolvedValue(0);

		await listProducts({});

		expect(db.product.findMany.mock.calls[0][0].where).toMatchObject({
			isActive: true,
			variants: { some: { isActive: true, stock: { gt: 0 } } }
		});
	});

	it('обраний розмір шукається серед доступних варіантів', async () => {
		db.product.findMany.mockResolvedValue([]);
		db.product.count.mockResolvedValue(0);

		await listProducts({ sizes: ['M'] });

		// Інакше товар знаходився б за розміром, якого немає на складі.
		expect(db.product.findMany.mock.calls[0][0].where.variants).toEqual({
			some: { isActive: true, stock: { gt: 0 }, size: { in: ['M'] } }
		});
	});

	it('сторінка товару віддає лише розміри в наявності', async () => {
		db.product.findFirst.mockResolvedValue({
			...row(),
			description: 'опис',
			category: { slug: 'sukni', name: 'Сукні' },
			variants: [
				{
					id: 'v1',
					size: 'M',
					color: 'Чорний',
					colorHex: '#000',
					finalPrice: null,
					stock: 2
				}
			]
		});

		const product = await getProduct('suknia-olivia');

		expect(db.product.findFirst.mock.calls[0][0].select.variants.where).toEqual({
			isActive: true,
			stock: { gt: 0 }
		});
		// Своєї ціни у варіанта немає — бере ціну товару зі знижкою.
		expect(product?.variants[0].price).toBe(219_900);
		expect(product?.price).toBe(219_900);
		expect(product?.compareAt).toBe(299_900);
	});

	it('розпроданий товар відкривається, але без варіантів', async () => {
		db.product.findFirst.mockResolvedValue({
			...row(),
			description: 'опис',
			category: { slug: 'sukni', name: 'Сукні' },
			variants: []
		});

		const product = await getProduct('suknia-olivia');

		expect(product).not.toBeNull();
		expect(product?.variants).toEqual([]);
	});

	it('характеристики без значення до сторінки не доїжджають', async () => {
		db.product.findFirst.mockResolvedValue({
			...row(),
			description: 'опис',
			category: { slug: 'sukni', name: 'Сукні' },
			variants: [],
			// Так виглядає недозаповнена картка в CRM.
			attributes: [
				{ name: 'Склад', value: '  95% віскоза  ' },
				{ name: 'Країна виробництва', value: '   ' },
				{ name: '', value: 'Україна' }
			]
		});

		const product = await getProduct('suknia-olivia');

		expect(product?.attributes).toEqual([{ name: 'Склад', value: '95% віскоза' }]);
	});

	/**
	 * Порядок кольорів і розмірів задає менеджер у CRM, і живе він у
	 * `ProductVariant.position`. Без цієї сортировки база віддавала б
	 * рядки як їй зручно, а сайт показав би кольори абеткою — «Білий»
	 * попереду «Чорного», хоча в CRM задано навпаки.
	 */
	it('варіанти беруться в порядку, заданому в CRM', async () => {
		db.product.findFirst.mockResolvedValue({
			...row(),
			description: 'опис',
			category: { slug: 'sukni', name: 'Сукні' },
			variants: []
		});

		await getProduct('suknia-olivia');
		const select = db.product.findFirst.mock.calls[0][0].select;

		expect(select.variants.orderBy[0]).toEqual({ position: 'asc' });
		// Позиція доїжджає до сторінки: списки розмірів і кольорів
		// збираються з варіантів уже в браузері.
		expect(select.variants.select.position).toBe(true);
	});

	it('вимкненого в CRM товару немає навіть за прямим посиланням', async () => {
		db.product.findFirst.mockResolvedValue(null);

		expect(await getProduct('suknia-olivia')).toBeNull();
		expect(db.product.findFirst.mock.calls[0][0].where).toMatchObject({ isActive: true });
	});
});

describe('картка товару', () => {
	/**
	 * Точний випадок із бойової бази: «Сукня-міді Amélie» має п'ять чорних
	 * кадрів і п'ять білих, чорний розібрали. Обкладинкою має стати білий
	 * кадр — той самий колір, який відкриється за кліком по картці.
	 */
	it('обкладинка — колір, який є в наявності, а не перше фото товару', async () => {
		db.product.findMany.mockResolvedValue([
			row({
				images: [
					{ url: 'ch-1.jpg', alt: null, color: 'Чорний' },
					{ url: 'ch-2.jpg', alt: null, color: 'Чорний' },
					{ url: 'bi-1.jpg', alt: null, color: 'Білий' },
					{ url: 'bi-2.jpg', alt: null, color: 'Білий' }
				],
				// Чорного в наявності немає, тож до картки він не доїжджає.
				variants: [{ color: 'Білий', stock: 10 }]
			})
		]);
		db.product.count.mockResolvedValue(1);

		const { items } = await listProducts({});

		expect(items[0].image?.url).toBe('bi-1.jpg');
		expect(items[0].hoverImage?.url).toBe('bi-2.jpg');
	});

	it('колір у фото не проставлений — обкладинкою лишається перше фото', async () => {
		db.product.findMany.mockResolvedValue([row()]);
		db.product.count.mockResolvedValue(1);

		const { items } = await listProducts({});

		expect(items[0].image?.url).toBe('https://example.test/1.jpg');
		expect(items[0].hoverImage?.url).toBe('https://example.test/2.jpg');
	});

	it('усе розібрали — картка все одно з фото, а не порожня', async () => {
		db.product.findMany.mockResolvedValue([
			row({
				images: [{ url: 'ch-1.jpg', alt: null, color: 'Чорний' }],
				variants: []
			})
		]);
		db.product.count.mockResolvedValue(1);

		const { items } = await listProducts({});

		expect(items[0].image?.url).toBe('ch-1.jpg');
		expect(items[0].inStock).toBe(false);
	});

	/**
	 * На картці кольори — це крапки під фото. Їх порядок так само не
	 * наш: його задає менеджер, і в списку категорії він має збігатися
	 * з тим, що покупець побачить на сторінці товару.
	 */
	it('кольори на картці беруться в порядку, заданому в CRM', async () => {
		db.product.findMany.mockResolvedValue([row()]);
		db.product.count.mockResolvedValue(1);

		await listProducts({});

		expect(db.product.findMany.mock.calls[0][0].select.variants.orderBy[0]).toEqual({
			position: 'asc'
		});
	});
});

describe('listCategoryCards', () => {
	it('віддає фото категорії як є', async () => {
		db.category.findMany.mockResolvedValue([category()]);

		expect(await listCategoryCards()).toEqual([
			{
				slug: 'sukni',
				name: 'Сукні',
				productCount: 4,
				imageUrl: 'https://example.test/sukni.jpg'
			}
		]);
	});

	it('категорія без фото не валить сторінку', async () => {
		db.category.findMany.mockResolvedValue([category({ imageUrl: null })]);

		expect((await listCategoryCards())[0].imageUrl).toBeNull();
	});

	it('категорія без товарів на вітрину не потрапляє', async () => {
		db.category.findMany.mockResolvedValue([
			category({ slug: 'porozhnia', _count: { products: 0 } }),
			category()
		]);

		expect((await listCategoryCards()).map((card) => card.slug)).toEqual(['sukni']);
	});

	it('рахує тільки те, що можна купити, і тримає порядок категорій', async () => {
		db.category.findMany.mockResolvedValue([]);

		await listCategoryCards();

		const args = db.category.findMany.mock.calls[0][0];
		// Лічильник на плитці не має обіцяти розпродані моделі.
		expect(args.select._count.select.products.where).toEqual({
			isActive: true,
			variants: { some: { isActive: true, stock: { gt: 0 } } }
		});
		expect(args.orderBy).toEqual([{ position: 'asc' }, { name: 'asc' }]);
	});
});

describe('меню категорій', () => {
	/**
	 * Меню є на кожній сторінці. Порожня категорія в ньому — це десятки
	 * посилань на сторінку «нічого не знайшли».
	 */
	it('категорія без товарів у меню не потрапляє', async () => {
		db.category.findMany.mockResolvedValue([
			category({ slug: 'pukhovyky', name: 'Пуховики', _count: { products: 0 } }),
			category()
		]);

		expect(await listCategories()).toEqual([{ slug: 'sukni', name: 'Сукні', productCount: 4 }]);
	});
});

describe('стрічка категорії на головній', () => {
	it('бере тільки живі товари саме цієї категорії й не більше ліміту', async () => {
		db.product.findMany.mockResolvedValue([row()]);

		const cards = await listCategoryProducts('sukni', 8);

		const args = db.product.findMany.mock.calls[0][0];
		expect(args.where.category).toEqual({ slug: 'sukni' });
		// Умова «товар живий» одна на весь каталог — вона має бути й тут.
		expect(args.where.variants).toEqual({ some: { isActive: true, stock: { gt: 0 } } });
		expect(args.take).toBe(8);
		expect(cards[0].slug).toBe('suknia-olivia');
	});
});

describe('колекція', () => {
	it('полиці йдуть у порядку колекції, а не бази', async () => {
		db.category.findMany.mockResolvedValue([
			{ slug: 'palto', name: 'Пальто', products: [row({ id: 'p2', slug: 'palto-nord' })] },
			{ slug: 'demisezonni-kurtky', name: 'Демісезонні куртки', products: [row()] }
		]);

		const shelves = await listCollection(['demisezonni-kurtky', 'palto']);

		expect(shelves.map((shelf) => shelf.name)).toEqual(['Демісезонні куртки', 'Пальто']);
		expect(shelves[1].products[0].slug).toBe('palto-nord');
	});

	it('на полицю йде тільки те, що можна купити', async () => {
		db.category.findMany.mockResolvedValue([]);

		await listCollection(['palto']);

		const args = db.category.findMany.mock.calls[0][0];
		expect(args.where).toEqual({ slug: { in: ['palto'] } });
		expect(args.select.products.where).toEqual({
			isActive: true,
			variants: { some: { isActive: true, stock: { gt: 0 } } }
		});
	});

	it('розібрана категорія й категорія зі зміненою адресою полиці не отримують', async () => {
		db.category.findMany.mockResolvedValue([{ slug: 'palto', name: 'Пальто', products: [] }]);

		expect(await listCollection(['palto', 'vitrovky'])).toEqual([]);
	});
});

describe('сторінка результатів пошуку', () => {
	it('порядок доречності зберігається, а сторінка ріжеться в пам’яті', async () => {
		// База віддає в довільному порядку — правильний порядок задає пошук.
		db.product.findMany.mockResolvedValue([row({ id: 'b' }), row({ id: 'a' })]);

		const result = await listProducts({ ids: ['a', 'b'] });

		expect(result.items.map((item) => item.id)).toEqual(['a', 'b']);
		expect(result.total).toBe(2);
		// Окремий count не потрібен: усе знайдене вже в пам’яті.
		expect(db.product.count).not.toHaveBeenCalled();
	});

	it('шукає лише серед знайденого, а текстову умову не дублює', async () => {
		db.product.findMany.mockResolvedValue([]);

		await listProducts({ ids: ['a'], query: 'сукня' });

		const where = db.product.findMany.mock.calls[0][0].where;
		expect(where.id).toEqual({ in: ['a'] });
		expect(where.OR).toBeUndefined();
	});

	it('пошук нічого не знайшов — у базу не ходимо зовсім', async () => {
		const result = await listProducts({ ids: [] });

		expect(result.items).toEqual([]);
		expect(result.total).toBe(0);
		expect(db.product.findMany).not.toHaveBeenCalled();
	});

	it('явне сортування за ціною важливіше за доречність', async () => {
		db.product.findMany.mockResolvedValue([row()]);
		db.product.count.mockResolvedValue(1);

		await listProducts({ ids: ['a'], sort: 'price-asc' });

		// Сортує база, тож сторінку вона ж і ріже.
		expect(db.product.findMany.mock.calls[0][0].orderBy).toEqual({ finalPrice: 'asc' });
		expect(db.product.count).toHaveBeenCalled();
	});
});
