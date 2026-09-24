import { CATALOG_CACHE_MS } from '$lib/config';
import { cached } from '$lib/server/cache';
import { listCategories, listFeedProducts } from '$lib/server/catalog';
import { llmsTxt } from '$lib/server/feeds';
import type { RequestHandler } from './$types';

/**
 * Довідка про магазин для ІІ-асистентів — https://llmstxt.org.
 *
 * Звичайну сторінку асистент читає крізь меню, скрипти й верстку, а тут
 * отримує голі факти з посиланнями: що є, почім, як доставляють і як
 * повернути. Файл збирається з бази, тож ціни в ньому ті самі, що на
 * сайті, — і так само оновлюються.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const [products, categories] = await Promise.all([
		cached('feed:products', CATALOG_CACHE_MS, listFeedProducts),
		cached('categories', CATALOG_CACHE_MS, listCategories)
	]);

	setHeaders({
		// Усередині Markdown, але тип — text/plain: text/markdown Chrome
		// пропонує завантажити файлом, замість того щоб показати.
		'content-type': 'text/plain; charset=utf-8',
		'cache-control': 'public, max-age=0, s-maxage=3600'
	});

	return new Response(llmsTxt(url.origin, products, categories));
};
