import { CATALOG_CACHE_MS, HOME_CATEGORY_LIMIT } from '$lib/config';
import { cached } from '$lib/server/cache';
import { listCategoryProducts } from '$lib/server/catalog';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/category/sukni — товари категорії для стрічки на головній.
 *
 * Стрічки нижче першого екрана беруть свої картки звідси, коли покупець
 * до них догортає. Порожня відповідь — це 404: категорію або прибрали
 * в CRM, або в ній не лишилось нічого в наявності.
 */
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const products = await cached(`category:${params.slug}`, CATALOG_CACHE_MS, () =>
		listCategoryProducts(params.slug, HOME_CATEGORY_LIMIT)
	);
	if (products.length === 0) error(404, 'Категорія порожня');

	// Той самий кеш, що й у головної: список товарів міняє CRM, і хвилина
	// затримки нікого не ламає, зате знімає навантаження з бази.
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	return json({ products });
};
