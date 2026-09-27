import type { FeedProduct } from '$lib/server/catalog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Файли для пошуковиків і Merchant Center: robots.txt, карта сайту, фід,
 * llms.txt. Їх ніхто не відкриває очима, тож поламку помітили б лише за
 * тижні — коли товари випали б із Google. Тут перевіряємо, що кожен з них
 * віддається з правильним типом, кешем для CDN і справжнім доменом.
 */

const listSitemapEntries = vi.fn();
const listFeedProducts = vi.fn();
const listCategories = vi.fn();

vi.mock('$lib/server/catalog', () => ({ listSitemapEntries, listFeedProducts, listCategories }));
vi.mock('$lib/server/cache', () => ({
	cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load()
}));

const robots = await import('$routes/robots.txt/+server');
const sitemap = await import('$routes/sitemap.xml/+server');
const feed = await import('$routes/merchant-feed.xml/+server');
const llms = await import('$routes/llms.txt/+server');

const ORIGIN = 'https://lilylook.store';

/** Викликає GET роуту й повертає тіло та заголовки, які він виставив. */
async function get(module: { GET: unknown }, path: string) {
	const headers: Record<string, string> = {};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const response: Response = await (module.GET as any)({
		url: new URL(`${ORIGIN}${path}`),
		setHeaders: (values: Record<string, string>) => Object.assign(headers, values)
	});
	return { body: await response.text(), headers };
}

const feedProduct: FeedProduct = {
	slug: 'sukniia-midi',
	name: 'Сукня міді',
	description: 'Легка сукня',
	category: { name: 'Сукні', slug: 'sukni' },
	price: 150_000,
	compareAt: null,
	images: [{ url: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg', color: null }],
	variants: [{ sku: 'SUK-M-BLK', size: 'M', color: 'Чорний', price: 150_000 }]
};

beforeEach(() => {
	vi.clearAllMocks();
	listSitemapEntries.mockResolvedValue({
		products: [
			{
				slug: 'sukniia-midi',
				updatedAt: new Date('2026-09-01T10:00:00Z'),
				images: [{ url: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg?a=1&b=2' }]
			}
		],
		categories: [{ slug: 'sukni', updatedAt: new Date('2026-09-02T10:00:00Z') }]
	});
	listFeedProducts.mockResolvedValue([feedProduct]);
	listCategories.mockResolvedValue([{ slug: 'sukni', name: 'Сукні' }]);
});

describe('robots.txt', () => {
	it('закриває особисте й службове, веде на карту сайту свого домену', async () => {
		const { body, headers } = await get(robots, '/robots.txt');

		expect(headers['content-type']).toBe('text/plain; charset=utf-8');
		for (const path of ['/cart', '/checkout', '/order/', '/setup', '/api/']) {
			expect(body).toContain(`Disallow: ${path}\n`);
		}
		expect(body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
	});

	it('каталог, товари, колекції й фід відкриті для обходу', async () => {
		const { body } = await get(robots, '/robots.txt');
		const disallowed = body
			.split('\n')
			.filter((line) => line.startsWith('Disallow:'))
			.map((line) => line.slice('Disallow:'.length).trim());

		for (const path of ['/catalog', '/product/x', '/collection/autumn', '/merchant-feed.xml']) {
			expect(disallowed.some((rule) => path.startsWith(rule))).toBe(false);
		}
	});
});

describe('sitemap.xml', () => {
	it('головна, каталог, категорії, колекції, товари й умови — з абсолютними адресами', async () => {
		const { body, headers } = await get(sitemap, '/sitemap.xml');

		expect(headers['content-type']).toBe('application/xml; charset=utf-8');
		expect(headers['cache-control']).toContain('s-maxage=3600');
		const locs = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
		expect(locs).toEqual(
			expect.arrayContaining([
				`${ORIGIN}/`,
				`${ORIGIN}/catalog`,
				`${ORIGIN}/catalog/sukni`,
				`${ORIGIN}/collection/autumn`,
				`${ORIGIN}/product/sukniia-midi`,
				`${ORIGIN}/delivery`,
				`${ORIGIN}/returns`,
				`${ORIGIN}/contacts`
			])
		);
		expect(body).toContain('<lastmod>2026-09-01</lastmod>');
	});

	it('валідний XML: амперсанд в адресі фото не ламає карту', async () => {
		const { body } = await get(sitemap, '/sitemap.xml');

		expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(body).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
		expect(body).toContain('<image:loc>');
		expect(body.match(/<url>/g)).toHaveLength(body.match(/<\/url>/g)!.length);
	});

	it('жодних кошика, оформлення чи замовлень у карті', async () => {
		const { body } = await get(sitemap, '/sitemap.xml');

		expect(body).not.toMatch(/\/(cart|checkout|order|setup|api)\b/);
	});
});

describe('фід Merchant Center', () => {
	it('XML із товарами, не в індексі, кеш на CDN', async () => {
		const { body, headers } = await get(feed, '/merchant-feed.xml');

		expect(headers['content-type']).toBe('application/xml; charset=utf-8');
		expect(headers['x-robots-tag']).toBe('noindex');
		expect(headers['cache-control']).toContain('s-maxage=3600');
		expect(body).toContain('<g:id>SUK-M-BLK</g:id>');
		expect(body).toContain(`${ORIGIN}/product/sukniia-midi`);
	});
});

describe('llms.txt', () => {
	it('текстом, з товарами й умовами магазину', async () => {
		const { body, headers } = await get(llms, '/llms.txt');

		expect(headers['content-type']).toBe('text/plain; charset=utf-8');
		expect(body).toContain('Сукня міді');
		expect(body).toContain('за тарифом перевізника');
		expect(body).toContain(`${ORIGIN}/`);
	});
});
