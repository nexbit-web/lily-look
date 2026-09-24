import { isDatabaseConfigured } from '$lib/server/db';
import { serializeJsonLd, storeNode, websiteNode } from '$lib/server/seo';
import { redirect, type Handle } from '@sveltejs/kit';

/**
 * Поки DATABASE_URL не заданий, будь-який запит веде на /setup з інструкцією.
 * Це рятує від стіни стектрейсів Prisma одразу після `git clone`.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const onSetupPage = event.url.pathname === '/setup';

	if (!isDatabaseConfigured() && !onSetupPage) {
		redirect(307, '/setup');
	}
	if (isDatabaseConfigured() && onSetupPage) {
		redirect(307, '/');
	}

	/**
	 * Розмітка Schema.org вставляється тут, а не в шаблоні сторінки.
	 *
	 * Svelte не дає покласти <script> у svelte:head без {@html}, а це діра
	 * під XSS. Тому сторінки лише складають вузли графа в locals, а сюди
	 * приходить готовий, екранований JSON — рівно один тег на документ.
	 * Магазин і сайт описані на кожній сторінці; решту додають самі сторінки.
	 */
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			if (!html.includes('%lily.jsonld%')) return html;

			const origin = event.url.origin;
			const nodes = [storeNode(origin), websiteNode(origin), ...(event.locals.jsonLd ?? [])];

			return html.replace('%lily.jsonld%', serializeJsonLd(nodes));
		}
	});

	secure(response, event.url);
	return response;
};

/**
 * Заголовки безпеки — на кожну відповідь.
 *
 * Жоден із них не міняє того, як сайт виглядає чи працює; вони лише
 * забирають у браузера можливості, які магазину не потрібні, а зловмиснику
 * знадобились би:
 *  — сторінку не можна вставити в чужий <iframe>: інакше оформлення
 *    замовлення можна накрити прозорою підробкою й «натиснути» за покупця;
 *  — браузер не вгадує тип файлу за вмістом, а вірить заголовку;
 *  — у чужі сайти не йде повна адреса сторінки, лише домен;
 *  — камера, мікрофон і геолокація вимкнені: магазину вони ні до чого.
 *
 * HSTS — тільки на HTTPS: оголошений по HTTP, він нічого не значить, а
 * локальний `npm run dev` заблокував би собі ж. Без includeSubDomains —
 * піддомени можуть жити й без сертифіката, і ламати їх не можна.
 *
 * Повної Content-Security-Policy тут свідомо немає. Вона мала б перелічити
 * все, що сайт вантажить, і все одно дозволити вбудовані стилі — ними
 * рухаються галерея й тости. Без перевірки на живому сайті така політика
 * швидше зламає оформлення замовлення, ніж когось зупинить.
 */
function secure(response: Response, url: URL): void {
	const headers = response.headers;

	headers.set('x-content-type-options', 'nosniff');
	headers.set('x-frame-options', 'SAMEORIGIN');
	headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');

	if (url.protocol === 'https:') {
		headers.set('strict-transport-security', 'max-age=31536000');
	}
}
