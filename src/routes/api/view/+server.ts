import { identify, track } from '$lib/server/analytics';
import { metaView } from '$lib/server/meta';
import type { RequestHandler } from './$types';

/**
 * POST /api/view — перехід на іншу сторінку всередині сайту.
 *
 * Шле його `sendBeacon` з макета після кожного переходу; у тілі — лише
 * адреса сторінки. Відповідь порожня: браузер її навіть не читає.
 */
export const POST: RequestHandler = async (event) => {
	const path = (await event.request.text()).trim();
	if (!/^\/\S{0,199}$/.test(path)) return new Response(null, { status: 400 });

	const visitor = identify(event);
	if (visitor) {
		const page = new URL(path, event.url);
		track(visitor, 'view', page.pathname);
		metaView(event, visitor, page);
	}

	return new Response(null, { status: 204 });
};
