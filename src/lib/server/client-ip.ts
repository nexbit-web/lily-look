/**
 * IP покупця. Сайт стоїть за проксі хостингу, і сам сервер бачить лише
 * адресу проксі (127.0.0.1) — справжня приходить у `X-Forwarded-For`.
 * Локальна адреса — як жодної.
 *
 * Потрібен для зіставлення з рекламою (`meta.ts`) і для ліміту обертів
 * колеса (`wheel.ts`).
 */
export function clientIp(event: {
	request: Request;
	getClientAddress?: () => string;
}): string | null {
	const forwarded = event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	let ip = forwarded || null;
	if (!ip) {
		try {
			ip = event.getClientAddress?.() ?? null;
		} catch {
			ip = null;
		}
	}
	if (!ip || /^(127\.|::1$|::ffff:127\.)/.test(ip)) return null;
	return ip;
}
