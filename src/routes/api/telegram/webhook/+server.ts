import { env } from '$env/dynamic/private';
import { alreadyHandled } from '$lib/server/bot/access';
import { handleUpdate, type Update } from '$lib/server/bot/handlers';
import type { RequestHandler } from './$types';

/**
 * Вхід для Telegram. Сюди він шле кожне повідомлення й кожне натискання.
 *
 * Адреса публічна, тож перше, що тут відбувається, — перевірка секрету.
 * Telegram надсилає його заголовком, і задається він при реєстрації
 * вебхука (`npm run telegram:webhook`). Без цієї перевірки будь-хто, хто
 * вгадав адресу, міг би вдавати із себе Telegram і рухати замовлення.
 *
 * Далі все відповідає 200 — навіть помилки. Telegram повторює доставку,
 * поки не отримає 200, і якщо віддавати 500 на зламаному апдейті, він
 * зациклиться на ньому й перестане присилати решту.
 */

/** Порівняння без ранньої зупинки — щоб час відповіді не підказував секрет. */
function sameSecret(got: string, expected: string): boolean {
	if (got.length !== expected.length) return false;

	let diff = 0;
	for (let index = 0; index < got.length; index += 1) {
		diff |= got.charCodeAt(index) ^ expected.charCodeAt(index);
	}
	return diff === 0;
}

export const POST: RequestHandler = async ({ request, url }) => {
	const expected = env.TELEGRAM_WEBHOOK_SECRET;
	if (!expected) {
		console.error('[bot] TELEGRAM_WEBHOOK_SECRET не заданий — вебхук вимкнений');
		return new Response('not found', { status: 404 });
	}

	const got = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
	if (!sameSecret(got, expected)) {
		return new Response('forbidden', { status: 403 });
	}

	let update: Update;
	try {
		update = (await request.json()) as Update;
	} catch {
		return new Response('ok');
	}

	if (typeof update.update_id !== 'number') return new Response('ok');

	// Повтор тієї самої події не має спрацювати двічі: холодний старт
	// хостингу — рівно той випадок, коли Telegram не дочекався й переслав.
	if (await alreadyHandled(BigInt(update.update_id))) return new Response('ok');

	await handleUpdate(update, url.origin);

	return new Response('ok');
};
