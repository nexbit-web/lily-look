import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Список товарів: що бачить Google (заголовок, canonical, noindex) і що
 * буває з кривою адресою. Сторінки каталогу — головний вхід із пошуку,
 * тож тут кожна помилка коштує видачі.
 */

const getCategory = vi.fn();
const listCategoryCards = vi.fn();
const listProducts = vi.fn();
const listFacets = vi.fn();
const categoryPriceRange = vi.fn();
const searchProductIds = vi.fn();

vi.mock('$lib/server/catalog', () => ({
	getCategory,
	listCategoryCards,
	listProducts,
	listFacets,
	categoryPriceRange
}));
vi.mock('$lib/server/search', () => ({ searchProductIds }));

const { load } = await import('$routes/catalog/[[category]]/+page.server');

type Seo = { title: string; description: string; canonical: string; index: boolean };
type Result = { view: string; seo: Seo; intro: string | null; page?: number };

async function open(path: string) {
	const url = new URL(`https://lilylook.store${path}`);
	const category = url.pathname.split('/')[2] || undefined;
	const locals: { jsonLd?: { '@type': string }[] } = {};
	const data = (await load({
		params: { category },
		url,
		locals
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)) as Result;
	return { data, locals };
}

/** Результат `listProducts`: `total` товарів, по 12 на сторінку. */
function products(total: number, page = 1) {
	return { items: [], total, page, pageCount: Math.max(1, Math.ceil(total / 12)) };
}

beforeEach(() => {
	vi.clearAllMocks();
	getCategory.mockImplementation(async (slug: string) =>
		slug === 'sukni' ? { slug: 'sukni', name: 'Сукні', imageUrl: null } : null
	);
	listCategoryCards.mockResolvedValue([{ slug: 'sukni', name: 'Сукні' }]);
	listProducts.mockImplementation(async ({ page }: { page: number }) => products(30, page));
	listFacets.mockResolvedValue({ sizes: [], colors: [] });
	categoryPriceRange.mockResolvedValue({ min: 100_000, max: 300_000 });
	searchProductIds.mockResolvedValue(['p1']);
});

describe('вітрина /catalog', () => {
	it('без параметрів — категорії, у видачі, з крихтами', async () => {
		const { data, locals } = await open('/catalog');

		expect(data.view).toBe('categories');
		expect(data.seo).toMatchObject({ canonical: '/catalog', index: true });
		expect(data.seo.description).toContain('сукні');
		expect(locals.jsonLd?.map((node) => node['@type'])).toEqual(['BreadcrumbList']);
		expect(listProducts).not.toHaveBeenCalled();
	});
});

describe('категорія', () => {
	it('у видачі: заголовок із назвою, canonical без зайвого, крихти й список', async () => {
		const { data, locals } = await open('/catalog/sukni');

		expect(data.seo.title).toContain('купити в Україні');
		expect(data.seo).toMatchObject({ canonical: '/catalog/sukni', index: true });
		expect(data.intro).not.toBeNull();
		expect(locals.jsonLd?.map((node) => node['@type'])).toEqual(['BreadcrumbList', 'ItemList']);
	});

	it('невідома категорія — 404', async () => {
		await expect(open('/catalog/nemaie')).rejects.toMatchObject({ status: 404 });
	});

	it('порожня категорія — жива, але не в індексі й без вступу', async () => {
		listProducts.mockResolvedValue(products(0));

		const { data } = await open('/catalog/sukni');

		expect(data.seo.index).toBe(false);
		expect(data.intro).toBeNull();
	});

	it('фільтри й сортування — не в індексі, canonical на чисту категорію', async () => {
		const { data } = await open('/catalog/sukni?size=M&color=Чорний&sort=price-asc');

		expect(data.seo).toMatchObject({ canonical: '/catalog/sukni', index: false });
	});

	it('друга сторінка — окрема адреса в індексі зі своїм заголовком', async () => {
		const { data } = await open('/catalog/sukni?page=2&sort=price-desc');

		expect(data.seo.canonical).toBe('/catalog/sukni?page=2');
		expect(data.seo.title).toContain('сторінка 2');
		expect(data.seo.index).toBe(true);
	});
});

describe('номер сторінки з адреси', () => {
	it.each([
		['дробовий — інакше база отримала б дробовий skip', '1.3'],
		['відʼємний', '-2'],
		['нуль', '0'],
		['не число', 'abc'],
		['експонента', '1e3'],
		['порожній', '']
	])('%s — перша сторінка', async (_case, value) => {
		const { data } = await open(`/catalog/sukni?page=${value}`);

		expect(listProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
		expect(data.seo.canonical).toBe('/catalog/sukni');
	});

	it('за межами списку — 404, а не порожня сторінка з кодом 200', async () => {
		await expect(open('/catalog/sukni?page=9')).rejects.toMatchObject({ status: 404 });
	});

	it('остання існуюча сторінка відкривається', async () => {
		const { data } = await open('/catalog/sukni?page=3');

		expect(data.seo.canonical).toBe('/catalog/sukni?page=3');
	});
});

describe('пошук і розпродаж', () => {
	it('результати пошуку не індексуються', async () => {
		const { data } = await open('/catalog?q=куртка');

		expect(searchProductIds).toHaveBeenCalledWith('куртка');
		expect(data.seo.index).toBe(false);
		expect(data.seo.title).toContain('куртка');
	});

	it('розпродаж у видачі, canonical зберігає sale=1', async () => {
		const { data } = await open('/catalog?sale=1&sort=price-asc');

		expect(data.seo).toMatchObject({ canonical: '/catalog?sale=1', index: true });
	});
});
