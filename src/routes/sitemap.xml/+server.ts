import { listSitemapEntries } from '$lib/server/catalog';
import type { RequestHandler } from './$types';

/**
 * Карта сайту.
 *
 * Збирається з бази на кожен запит: додали товар у CRM — він з'явиться в
 * карті без деплою. Дата зміни береться з `updatedAt`, тому Google перезаходить
 * саме на те, що справді змінилось, а не переобходить каталог цілком.
 *
 * У карту потрапляє тільки те, що можна купити: розпродані й вимкнені моделі
 * не показуються на сайті, отже їм нічого робити і в карті.
 */

/** Скільки браузер і пошуковик можуть тримати карту в кеші. */
const CACHE_SECONDS = 3600;

function url(loc: string, lastmod: Date | null, priority: string): string {
	const date = lastmod ? `\n\t\t<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '';
	return `\t<url>\n\t\t<loc>${loc}</loc>${date}\n\t\t<priority>${priority}</priority>\n\t</url>`;
}

export const GET: RequestHandler = async ({ url: requestUrl, setHeaders }) => {
	const origin = requestUrl.origin;
	const { products, categories } = await listSitemapEntries();

	const entries = [
		url(`${origin}/`, null, '1.0'),
		url(`${origin}/catalog`, null, '0.9'),
		...categories.map((category) =>
			url(`${origin}/catalog/${category.slug}`, category.updatedAt, '0.8')
		),
		...products.map((product) => url(`${origin}/product/${product.slug}`, product.updatedAt, '0.7'))
	];

	setHeaders({
		'content-type': 'application/xml; charset=utf-8',
		'cache-control': `public, max-age=0, s-maxage=${CACHE_SECONDS}`
	});

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
	);
};
