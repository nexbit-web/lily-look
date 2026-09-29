import { identify, optOut, track } from '$lib/server/analytics';
import { isDatabaseConfigured } from '$lib/server/db';
import { domainVerification, metaView, rememberAdClick } from '$lib/server/meta';
import { serializeJsonLd, storeNode, websiteNode } from '$lib/server/seo';
import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit';

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

	// Секретне посилання команди: цей пристрій більше не рахується.
	const staff = optOut(event);
	if (staff) {
		secure(staff, event.url);
		return staff;
	}

	// Перший показ сторінки рахує сервер — поки й так її віддає. Кука з
	// міткою ставиться до відповіді, тож визначаємо відвідувача заздалегідь.
	const visitor = isPageLoad(event) ? identify(event) : null;
	// Клік по рекламі — теж у куку, тож теж до відповіді.
	if (visitor) rememberAdClick(event);

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

			return html
				.replace('%lily.jsonld%', serializeJsonLd(nodes))
				.replace('%lily.verify%', domainVerification());
		}
	});

	secure(response, event.url);

	// Лише справжня сторінка: не редирект, не 404 і не файл на кшталт robots.txt.
	if (visitor && response.status === 200) {
		if (response.headers.get('content-type')?.startsWith('text/html')) {
			track(visitor, 'view', event.url.pathname);
			metaView(event, visitor, event.url);
		}
	}
	return response;
};

/**
 * Браузер відкриває сторінку цілком: перший захід, оновлення, посилання
 * з реклами. Переходи всередині сайту йдуть інакше (`__data.json`), і їх
 * тут не рахуємо: такий самий запит браузер шле й тоді, коли на картку
 * просто навели курсор, — це ще не перегляд. Їх рахує `/api/view`.
 */
function isPageLoad(event: RequestEvent): boolean {
	return (
		event.request.method === 'GET' &&
		!event.isDataRequest &&
		event.route.id !== null &&
		!event.url.pathname.startsWith('/api/') &&
		(event.request.headers.get('accept') ?? '').includes('text/html')
	);
}

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
