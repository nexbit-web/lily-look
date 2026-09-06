import type { RequestHandler } from './$types';

/**
 * robots.txt віддається роутом, а не статичним файлом: тільки так у ньому
 * опиняється справжній домен у рядку Sitemap — той самий і на проді,
 * і на тестовому піддомені.
 *
 * Закриваємо те, що не має сенсу в індексі: кошик і оформлення (сторінки
 * одного покупця), сторінку замовлення (там персональні дані), службовий
 * /setup і API. Сторінки з фільтрами закриті прапорцем noindex у самій
 * сторінці, а не тут: Disallow заборонив би обхід, і Google не побачив би
 * ані noindex, ані канонічної адреси.
 */
export const GET: RequestHandler = ({ url, setHeaders }) => {
	setHeaders({
		'content-type': 'text/plain; charset=utf-8',
		'cache-control': 'public, max-age=0, s-maxage=3600'
	});

	return new Response(
		[
			'User-agent: *',
			'Allow: /',
			'Disallow: /cart',
			'Disallow: /checkout',
			'Disallow: /order/',
			'Disallow: /setup',
			'Disallow: /api/',
			'',
			`Sitemap: ${url.origin}/sitemap.xml`,
			''
		].join('\n')
	);
};
