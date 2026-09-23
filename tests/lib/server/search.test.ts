import type { SearchRow } from '$lib/server/catalog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Покажчик пошуку.
 *
 * Головне тут — що каталог читається з бази один раз на всі запити:
 * підказка друкується по літері, і похід у Neon на кожну був би і
 * повільним, і зайвим. Друге — порядок видачі: збіг у назві має стояти
 * вище за згадку в описі.
 */

vi.mock('$app/environment', () => ({ dev: false }));

const listSearchRows = vi.fn();
vi.mock('$lib/server/catalog', () => ({ listSearchRows }));

const { searchProducts, searchProductIds } = await import('$lib/server/search');
const { clearCache } = await import('$lib/server/cache');

const card = (id: string, name: string) => ({
	id,
	slug: id,
	name,
	price: 100_000,
	compareAt: null,
	image: null,
	hoverImage: null,
	colors: [],
	inStock: true
});

const row = (id: string, name: string, doc: Partial<SearchRow['doc']> = {}): SearchRow => ({
	card: card(id, name),
	doc: { name, category: 'Сукні', colors: [], skus: [], description: '', ...doc }
});

const catalog: SearchRow[] = [
	row('dress', 'Сатинова сукня Olivia', { colors: ['Чорний'] }),
	row('jacket', 'Стьобана куртка Lea', {
		category: 'Верхній одяг',
		colors: ['Відтінок хакі'],
		skus: ['KURTKA-LEA-M'],
		description: 'Тепла куртка на синтепоні.'
	}),
	row('coat', 'Пальто Vivienne', {
		category: 'Пальто',
		description: 'Класичне пальто під сукню або костюм.'
	})
];

beforeEach(() => {
	clearCache();
	listSearchRows.mockReset();
	listSearchRows.mockResolvedValue(catalog);
});

describe('покажчик у пам’яті', () => {
	it('читає каталог із бази один раз на скільки завгодно запитів', async () => {
		await searchProducts('сукня', 6);
		await searchProducts('куртка', 6);
		await searchProductIds('пальто');

		expect(listSearchRows).toHaveBeenCalledTimes(1);
	});

	it('порожній запит у базу взагалі не заглядає', async () => {
		const result = await searchProducts('  ', 6);

		expect(result).toEqual({ items: [], total: 0 });
		expect(listSearchRows).not.toHaveBeenCalled();
	});
});

describe('видача', () => {
	it('знаходить за назвою', async () => {
		const { items } = await searchProducts('сукня', 6);

		expect(items[0].id).toBe('dress');
	});

	it('збіг у назві стоїть вище за згадку в описі', async () => {
		const { items } = await searchProducts('сукню', 6);

		// «сукня» в назві першого товару, у третього — лише в описі.
		expect(items.map((item) => item.id)).toEqual(['dress', 'coat']);
	});

	it('знаходить за кольором і за категорією', async () => {
		expect((await searchProducts('хакі', 6)).items[0].id).toBe('jacket');
		expect((await searchProducts('верхній одяг', 6)).items[0].id).toBe('jacket');
	});

	it('знаходить за артикулом із CRM', async () => {
		expect((await searchProducts('KURTKA-LEA-M', 6)).items[0].id).toBe('jacket');
	});

	it('каже, скільки всього знайшлось, навіть коли віддає менше', async () => {
		// «сукню» підходить двом товарам: одному назвою, другому — описом.
		const result = await searchProducts('сукню', 1);

		expect(result.items).toHaveLength(1);
		expect(result.total).toBe(2);
	});

	it('нічого схожого — порожньо', async () => {
		expect((await searchProducts('qwerty', 6)).items).toEqual([]);
	});
});
