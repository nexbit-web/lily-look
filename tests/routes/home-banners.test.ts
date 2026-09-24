import type { CategoryCard } from '$lib/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Банери головної. Картинки лежать у static, але куди вони ведуть і чи
 * показуються взагалі — вирішує каталог: банер не має кликати туди, де
 * нічого купити.
 */

const catalog = {
	listCategoryCards: vi.fn(),
	listCategoryProducts: vi.fn(),
	listNewArrivals: vi.fn(),
	listSale: vi.fn()
};

vi.mock('$lib/server/catalog', () => catalog);
// Кеш у пам'яті тут заважав би: кожен тест збирає головну заново.
vi.mock('$lib/server/cache', () => ({
	cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load()
}));

const { load } = await import('$routes/+page.server');

const category = (slug: string, name: string): CategoryCard => ({
	slug,
	name,
	productCount: 3,
	imageUrl: null
});

async function banners(categories: CategoryCard[]) {
	catalog.listCategoryCards.mockResolvedValue(categories);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const data = (await load({} as any)) as { banners: { image: string; href: string | null }[] };
	return data.banners;
}

beforeEach(() => {
	catalog.listCategoryProducts.mockResolvedValue([]);
	catalog.listNewArrivals.mockResolvedValue([]);
	catalog.listSale.mockResolvedValue([]);
});

describe('банери головної', () => {
	it('осінь веде на колекцію, куртки — у свою категорію, доставка — нікуди', async () => {
		const result = await banners([
			category('demisezonni-kurtky', 'Демісезонні куртки'),
			category('palto', 'Пальто')
		]);

		expect(result.map((banner) => [banner.image, banner.href])).toEqual([
			['/banners/autumn-collection', '/collection/autumn'],
			['/banners/demi-season-jackets', '/catalog/demisezonni-kurtky'],
			['/banners/free-delivery', null]
		]);
	});

	it('адреса категорії — з каталогу: CRM змінила slug, банер іде за ним', async () => {
		const result = await banners([category('kurtky-vesna-osin', 'Демісезонні куртки')]);

		expect(result.find((banner) => banner.image.includes('demi-season'))?.href).toBe(
			'/catalog/kurtky-vesna-osin'
		);
	});

	it('куртки розібрали — банера про них немає, решта лишається', async () => {
		const result = await banners([category('palto', 'Пальто')]);

		expect(result.map((banner) => banner.image)).toEqual([
			'/banners/autumn-collection',
			'/banners/free-delivery'
		]);
	});

	it('в осінніх категоріях нічого немає — банер колекції не веде в порожнечу', async () => {
		const result = await banners([category('rubashky', 'Сорочки')]);

		expect(result.map((banner) => banner.image)).toEqual(['/banners/free-delivery']);
	});
});
