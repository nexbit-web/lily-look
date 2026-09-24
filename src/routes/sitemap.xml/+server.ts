import { IMAGE_LARGE, imageSrc } from '$lib/image';
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
 *
 * До кожного товару прикладені його фото (розширення image: від Google): так
 * Google Картинки знаходять кадри, навіть якщо галерея підвантажує їх
 * скриптом, і ведуть із пошуку по картинках прямо на сторінку товару.
 */

/** Скільки браузер і пошуковик можуть тримати карту в кеші. */
const CACHE_SECONDS = 3600;

/** Сторінки з умовами — рідко міняються, але саме їх читають перед покупкою. */
const INFO_PAGES = ['/delivery', '/returns', '/contacts'];

/** Адреси з CRM у XML: амперсанд у посиланні зламав би всю карту. */
function xml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function url(loc: string, lastmod: Date | null, priority: string, images: string[] = []): string {
	const date = lastmod ? `\n\t\t<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '';
	const pictures = images
		.map((image) => `\n\t\t<image:image><image:loc>${xml(image)}</image:loc></image:image>`)
		.join('');
	return `\t<url>\n\t\t<loc>${xml(loc)}</loc>${date}\n\t\t<priority>${priority}</priority>${pictures}\n\t</url>`;
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
		...products.map((product) =>
			url(
				`${origin}/product/${product.slug}`,
				product.updatedAt,
				'0.7',
				// Той самий розмір, що в розмітці товару: великий, але не оригінал.
				product.images.map((image) => new URL(imageSrc(image.url, IMAGE_LARGE), origin).href)
			)
		),
		...INFO_PAGES.map((path) => url(`${origin}${path}`, null, '0.4'))
	];

	setHeaders({
		'content-type': 'application/xml; charset=utf-8',
		'cache-control': `public, max-age=0, s-maxage=${CACHE_SECONDS}`
	});

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join('\n')}\n</urlset>\n`
	);
};
