import type { CollectionShelf, ProductCard } from '$lib/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Сторінка колекції: склад із config, товари з каталогу, тексти для
 * пошуковика — з того, що реально лежить на полицях.
 */

const listCollection = vi.fn();

vi.mock('$lib/server/catalog', () => ({ listCollection }));
vi.mock('$lib/server/cache', () => ({
	cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load()
}));

const { load } = await import('$routes/collection/[slug]/+page.server');

const card = (slug: string, price: number): ProductCard => ({
	id: slug,
	slug,
	name: slug,
	price,
	compareAt: null,
	image: null,
	hoverImage: null,
	colors: [],
	inStock: true
});

const shelves: CollectionShelf[] = [
	{
		slug: 'demisezonni-kurtky',
		name: 'Демісезонні куртки',
		products: [card('kurtka-1', 175_000), card('kurtka-2', 270_000)]
	},
	{ slug: 'palto', name: 'Пальто', products: [card('palto-1', 450_000)] }
];

type Result = {
	total: number;
	intro: string | null;
	seo: { title: string; canonical: string; index: boolean };
};

async function open(slug: string) {
	const locals: { jsonLd?: { '@type': string }[] } = {};
	const data = (await load({
		params: { slug },
		url: new URL(`https://lilylook.store/collection/${slug}`),
		locals
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)) as Result;
	return { data, locals };
}

beforeEach(() => {
	listCollection.mockReset();
});

describe('сторінка колекції', () => {
	it('бере склад із config і рахує всі моделі з усіх полиць', async () => {
		listCollection.mockResolvedValue(shelves);

		const { data } = await open('autumn');

		expect(listCollection).toHaveBeenCalledWith(expect.arrayContaining(['demisezonni-kurtky']));
		expect(data.total).toBe(3);
		expect(data.seo.canonical).toBe('/collection/autumn');
		expect(data.seo.index).toBe(true);
		expect(data.intro).toContain('демісезонні куртки, пальто');
	});

	it('для Google — крихти й список усіх товарів колекції', async () => {
		listCollection.mockResolvedValue(shelves);

		const { locals } = await open('autumn');

		expect(locals.jsonLd?.map((node) => node['@type'])).toEqual(['BreadcrumbList', 'ItemList']);
	});

	it('усе розібрали — сторінка жива, але з індексу випадає', async () => {
		listCollection.mockResolvedValue([]);

		const { data } = await open('autumn');

		expect(data.seo.index).toBe(false);
		expect(data.intro).toBeNull();
	});

	it('невідома колекція — 404, а не порожня сторінка', async () => {
		await expect(open('zyma')).rejects.toMatchObject({ status: 404 });
		expect(listCollection).not.toHaveBeenCalled();
	});
});
