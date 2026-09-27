import type { ProductDetail } from '$lib/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Сторінка товару — те, що Google показує карткою з ціною. Розпроданий чи
 * вимкнений товар має віддати 404, а живий — розмітку Product і крихти.
 */

const getProduct = vi.fn();
const listRecommended = vi.fn();

vi.mock('$lib/server/cart', () => ({ addToCart: vi.fn() }));
vi.mock('$lib/server/catalog', () => ({ getProduct, listRecommended }));

const { load } = await import('$routes/product/[slug]/+page.server');

const product: ProductDetail = {
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сатинова сукня Olivia',
	description: 'Сатин зі шляхетним блиском.',
	price: 264_900,
	compareAt: null,
	category: { slug: 'sukni', name: 'Сукні' },
	images: [{ url: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg', alt: 'фото', color: null }],
	measurements: [],
	attributes: [],
	variants: [
		{
			id: 'v1',
			sku: 'OLIVIA-S',
			size: 'S',
			color: 'Пудровий',
			colorHex: '#e8c9c9',
			price: 264_900,
			stock: 2,
			position: 0
		}
	]
};

async function open(slug: string) {
	const locals: { jsonLd?: { '@type': string }[] } = {};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const data = await (load as any)({
		params: { slug },
		locals,
		url: new URL(`https://lilylook.store/product/${slug}`)
	});
	return { data, locals };
}

beforeEach(() => {
	vi.clearAllMocks();
	listRecommended.mockResolvedValue([]);
});

describe('сторінка товару', () => {
	it('розпроданий або невідомий товар — 404', async () => {
		getProduct.mockResolvedValue(null);

		await expect(open('nemaie')).rejects.toMatchObject({ status: 404 });
		expect(listRecommended).not.toHaveBeenCalled();
	});

	it('живий товар — розмітка для Google і крихти з категорією', async () => {
		getProduct.mockResolvedValue(product);

		const { locals } = await open('suknia-olivia');

		const types = locals.jsonLd?.map((node) => node['@type']);
		expect(types?.[1]).toBe('BreadcrumbList');
		expect(JSON.stringify(locals.jsonLd)).toContain('https://lilylook.store/catalog/sukni');
		expect(JSON.stringify(locals.jsonLd)).toContain('"2649.00"');
	});

	it('строки доставки — для кожного способу, пораховані на сервері', async () => {
		getProduct.mockResolvedValue(product);

		const { data } = await open('suknia-olivia');

		expect(data.delivery.length).toBeGreaterThan(0);
		expect(data.delivery[0]).not.toHaveProperty('cost');
	});
});
