import { identify, track } from '$lib/server/analytics';
import type { RequestHandler } from './$types';

/**
 * POST /api/wheel — вікно з колесом показали.
 *
 * Шле його `sendBeacon` з макета в ту мить, коли вікно відкрилось; у тілі —
 * адреса сторінки, поверх якої воно з'явилось. Разом із `wheel_spin`
 * (його пише сама дія `/wheel?/spin`) це дає воронку колеса: скільки
 * людей його побачили, скільки крутили, скільки з них замовили.
 */
export const POST: RequestHandler = async (event) => {
	const path = (await event.request.text()).trim();
	if (!/^\/\S{0,199}$/.test(path)) return new Response(null, { status: 400 });

	const visitor = identify(event);
	if (visitor) track(visitor, 'wheel_shown', new URL(path, event.url).pathname);

	return new Response(null, { status: 204 });
};
