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
	return resolve(event, {
		transformPageChunk: ({ html }) => {
			if (!html.includes('%lily.jsonld%')) return html;

			const origin = event.url.origin;
			const nodes = [storeNode(origin), websiteNode(origin), ...(event.locals.jsonLd ?? [])];

			return html.replace('%lily.jsonld%', serializeJsonLd(nodes));
		}
	});
};
