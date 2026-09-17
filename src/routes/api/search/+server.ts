import { SEARCH_MIN_LENGTH, SEARCH_SUGGESTIONS } from '$lib/config';
import { searchProducts } from '$lib/server/search';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/search?q=куртка — підказки для рядка пошуку.
 *
 * Відповідь збирається з покажчика в пам'яті, тож у базу цей запит
 * зазвичай не ходить узагалі. Короткий запит відсікаємо тут, а не в
 * браузері: так поведінка однакова, хто б не питав.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	if (query.length < SEARCH_MIN_LENGTH) return json({ items: [], total: 0 });

	const result = await searchProducts(query, SEARCH_SUGGESTIONS);

	// Той самий час життя, що й у каталозі: поки товар не змінився, та сама
	// підказка не має ще раз турбувати сервер.
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return json(result);
};
