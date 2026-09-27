import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Службові API, які кличе сам сайт: підказки пошуку, довідник Нової Пошти
 * й стрічки категорій на головній. Кожен з них має чесно відповісти на
 * кривий запит кодом 4xx, а не 500, — і не нести в кеш CDN помилку.
 */

class NovaPoshtaError extends Error {
	constructor(
		message: string,
		readonly status = 502
	) {
		super(message);
	}
}

const searchProducts = vi.fn();
const searchSettlements = vi.fn();
const listWarehouses = vi.fn();
const listCategoryProducts = vi.fn();

vi.mock('$lib/server/search', () => ({ searchProducts }));
vi.mock('$lib/server/nova-poshta', () => ({
	NovaPoshtaError,
	searchSettlements,
	listWarehouses
}));
vi.mock('$lib/server/catalog', () => ({ listCategoryProducts }));
vi.mock('$lib/server/cache', () => ({
	cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load()
}));

const search = await import('$routes/api/search/+server');
const settlements = await import('$routes/api/nova-poshta/settlements/+server');
const warehouses = await import('$routes/api/nova-poshta/warehouses/+server');
const category = await import('$routes/api/category/[slug]/+server');

async function get(module: { GET: unknown }, path: string, params: Record<string, string> = {}) {
	const headers: Record<string, string> = {};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const response: Response = await (module.GET as any)({
		url: new URL(`https://lilylook.store${path}`),
		params,
		setHeaders: (values: Record<string, string>) => Object.assign(headers, values)
	});
	return { body: await response.json(), headers };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('/api/search', () => {
	it('коротший за дві літери запит у пошук не йде', async () => {
		const { body } = await get(search, '/api/search?q=%20к%20');

		expect(body).toEqual({ items: [], total: 0 });
		expect(searchProducts).not.toHaveBeenCalled();
	});

	it('нормальний запит — підказки з коротким кешем', async () => {
		searchProducts.mockResolvedValue({ items: [{ slug: 'x' }], total: 1 });

		const { body, headers } = await get(search, '/api/search?q=куртка');

		expect(searchProducts).toHaveBeenCalledWith('куртка', expect.any(Number));
		expect(body.total).toBe(1);
		expect(headers['cache-control']).toBe('public, max-age=60');
	});
});

describe('/api/nova-poshta', () => {
	it('міста — з кешем на CDN', async () => {
		searchSettlements.mockResolvedValue([{ ref: 'r1', label: 'Київ' }]);

		const { body, headers } = await get(settlements, '/api/nova-poshta/settlements?q=київ');

		expect(body.items).toHaveLength(1);
		expect(headers['cache-control']).toContain('s-maxage=3600');
	});

	it('відділення без міста — 400, у Нову Пошту не ходимо', async () => {
		await expect(get(warehouses, '/api/nova-poshta/warehouses')).rejects.toMatchObject({
			status: 400
		});
		expect(listWarehouses).not.toHaveBeenCalled();
	});

	it('Нова Пошта лягла — її код, а не 500, і без кешу', async () => {
		listWarehouses.mockRejectedValue(new NovaPoshtaError('Нова Пошта не відповідає', 504));

		await expect(
			get(warehouses, '/api/nova-poshta/warehouses?settlement=r1&q=1')
		).rejects.toMatchObject({ status: 504 });
	});

	it('інша помилка не ховається під виглядом Нової Пошти', async () => {
		searchSettlements.mockRejectedValue(new TypeError('bug'));

		await expect(get(settlements, '/api/nova-poshta/settlements?q=київ')).rejects.toBeInstanceOf(
			TypeError
		);
	});
});

describe('/api/category/[slug]', () => {
	it('товари категорії для стрічки на головній', async () => {
		listCategoryProducts.mockResolvedValue([{ slug: 'x' }]);

		const { body, headers } = await get(category, '/api/category/sukni', { slug: 'sukni' });

		expect(listCategoryProducts).toHaveBeenCalledWith('sukni');
		expect(body.products).toHaveLength(1);
		expect(headers['cache-control']).toContain('s-maxage=60');
	});

	it('порожня чи невідома категорія — 404', async () => {
		listCategoryProducts.mockResolvedValue([]);

		await expect(get(category, '/api/category/nemaie', { slug: 'nemaie' })).rejects.toMatchObject({
			status: 404
		});
	});
});
