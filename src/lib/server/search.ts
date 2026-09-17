import { CATALOG_CACHE_MS } from '$lib/config';
import { indexDoc, prepareQuery, score, type IndexedDoc } from '$lib/search';
import type { ProductCard } from '$lib/types';
import { cached } from './cache.js';
import { listSearchRows } from './catalog.js';

/**
 * Покажчик пошуку в пам'яті сервера.
 *
 * Увесь каталог читається одним запитом і лежить готовим до порівняння —
 * розібраним на слова. Тому підказка на кожну літеру обходиться без бази
 * взагалі: це частки мілісекунди замість походу в Neon і назад.
 *
 * Межа підходу — розмір каталогу: тисячі товарів у пам'яті нормально,
 * сотні тисяч — вже ні. Коли каталог доросте, замість цього файла
 * знадобиться повнотекстовий пошук у базі; інтерфейс лишиться тим самим.
 */

type Entry = { card: ProductCard; doc: IndexedDoc };

async function buildIndex(): Promise<Entry[]> {
	const rows = await listSearchRows();
	return rows.map((row) => ({ card: row.card, doc: indexDoc(row.doc) }));
}

function index() {
	return cached('search-index', CATALOG_CACHE_MS, buildIndex);
}

/** Знайдене, від найдоречнішого до найдальшого. */
async function rank(query: string): Promise<Entry[]> {
	const prepared = prepareQuery(query);
	if (prepared.terms.length === 0) return [];

	const scored: { entry: Entry; weight: number }[] = [];
	for (const entry of await index()) {
		const weight = score(prepared, entry.doc);
		if (weight > 0) scored.push({ entry, weight });
	}

	// При однаковій вазі — за назвою, щоб видача не стрибала між запитами.
	scored.sort(
		(a, b) => b.weight - a.weight || a.entry.card.name.localeCompare(b.entry.card.name, 'uk')
	);
	return scored.map((item) => item.entry);
}

/**
 * Підказки в рядку пошуку. `total` — скільки всього знайшлось: рядок
 * «показати все» має знати, чи є там ще щось за межами підказок.
 */
export async function searchProducts(
	query: string,
	limit: number
): Promise<{ items: ProductCard[]; total: number }> {
	const ranked = await rank(query);
	return { items: ranked.slice(0, limit).map((entry) => entry.card), total: ranked.length };
}

/**
 * Знайдені товари для сторінки результатів — у порядку доречності.
 * Каталог далі сам відфільтрує їх за розміром і кольором і поріже
 * на сторінки, тож тут віддається весь список.
 */
export async function searchProductIds(query: string): Promise<string[]> {
	const ranked = await rank(query);
	return ranked.map((entry) => entry.card.id);
}
