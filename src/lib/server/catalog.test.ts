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

vi.mock('./db.js', () => ({ db }));

const { getProduct, listCategoryCards, listProducts, listSale } = await import('./catalog.js');

/** Рядок товару в тому вигляді, в якому його віддає Prisma. */
const row = (patch: Record<string, unknown> = {}) => ({
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сукня Olivia',
	price: 299_900,
	finalPrice: 219_900,
	images: [
		{ url: 'https://example.test/1.jpg', alt: null },
		{ url: 'https://example.test/2.jpg', alt: 'ззаду' }
	],
	variants: [{ color: 'Чорний', stock: 3 }],
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

	it('вимкненого в CRM товару немає навіть за прямим посиланням', async () => {
		db.product.findFirst.mockResolvedValue(null);

		expect(await getProduct('suknia-olivia')).toBeNull();
		expect(db.product.findFirst.mock.calls[0][0].where).toMatchObject({ isActive: true });
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
