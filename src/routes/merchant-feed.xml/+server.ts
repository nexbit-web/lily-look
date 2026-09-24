import { CATALOG_CACHE_MS } from '$lib/config';
import { cached } from '$lib/server/cache';
import { listFeedProducts } from '$lib/server/catalog';
import { merchantFeed } from '$lib/server/feeds';
import type { RequestHandler } from './$types';

/**
 * Фід товарів для Google Merchant Center (і каталогу Meta).
 *
 * Саме через нього товари потрапляють у Google Покупки й у картки товарів
 * у видачі з ціною й фото. Merchant Center забирає файл за розкладом, тож
 * адресу вказують один раз, а вміст оновлюється разом із CRM.
 *
 * У видачу сам файл не потрапляє: це дані для Merchant Center, а не
 * сторінка для людей.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const products = await cached('feed:products', CATALOG_CACHE_MS, listFeedProducts);

	setHeaders({
		'content-type': 'application/xml; charset=utf-8',
		'cache-control': 'public, max-age=0, s-maxage=3600',
		'x-robots-tag': 'noindex'
	});

	return new Response(merchantFeed(url.origin, products));
};
