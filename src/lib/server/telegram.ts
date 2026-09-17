import { env } from '$env/dynamic/private';
import { buildOrderMessage, type OrderMessage } from '$lib/order-message';

/**
 * Сповіщення менеджерам у робочу групу Telegram.
 *
 * Навмисно best-effort: якщо бот не налаштований або Telegram лежить,
 * замовлення все одно створюється й лежить у базі — його видно в CRM і на
 * сторінці замовлення. Втратити продаж через чужий API гірше, ніж не
 * отримати повідомлення.
 *
 * Що тут передбачено, крім «надіслати»:
 *  — тимчасова відмова (мережа, 5xx, 429) переживається повторними
 *    спробами з паузами; при 429 пауза така, яку назвав сам Telegram;
 *  — остаточна відмова (поганий токен, бота вигнали з групи) не
 *    повторюється марно, а пишеться в лог зрозумілою мовою — щоб з логу
 *    було видно, що саме піти й виправити;
 *  — переїзд групи в супергрупу видно в логу разом із новим chat_id.
 *
 * Перевірити налаштування, не роблячи замовлення: `npm run telegram:check`.
 */

const TIMEOUT_MS = 8000;
/** Разом із першою спробою. */
const ATTEMPTS = 3;
/** Пауза перед другою і третьою спробою. */
const BACKOFF_MS = [700, 2500];
/** Скільки погодимось чекати, якщо Telegram просить зачекати довго. */
const MAX_RETRY_AFTER_MS = 20_000;

export type OrderNotification = OrderMessage;

export function isTelegramConfigured(): boolean {
	return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Attempt =
	| { ok: true }
	/** Варто спробувати ще: мережа, 5xx, перевищений ліміт. */
	| { ok: false; retry: true; waitMs?: number; why: string }
	/** Повторювати немає сенсу: треба щось змінити в налаштуваннях. */
	| { ok: false; retry: false; why: string };

/**
 * Переклад відмови Telegram на мову дій.
 *
 * Код помилки сам собою нічого не каже тому, хто налаштовує бота, тому
 * в лог іде не «400 Bad Request», а що саме зробити.
 */
function explain(status: number, description: string, chatId: string): string {
	if (status === 401) {
		return 'TELEGRAM_BOT_TOKEN недійсний — візьміть токен у @BotFather (/mybots → API Token)';
	}
	if (status === 403) {
		return `бот не може писати в чат ${chatId} — додайте його в групу й дайте право надсилати повідомлення`;
	}
	if (status === 400 && /chat not found/i.test(description)) {
		return `чат ${chatId} не знайдено — перевірте TELEGRAM_CHAT_ID (для груп він від'ємний, напр. -1001234567890)`;
	}
	if (status === 400 && /can't parse entities/i.test(description)) {
		return `Telegram не зрозумів розмітку повідомлення: ${description}`;
	}
	if (status === 400 && /message is too long/i.test(description)) {
		return 'повідомлення довше за ліміт Telegram — це помилка в складанні тексту';
	}
	return `${status}: ${description}`;
}

async function attemptSend(text: string): Promise<Attempt> {
	const chatId = env.TELEGRAM_CHAT_ID ?? '';

	let response: Response;
	try {
		response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				chat_id: chatId,
				text,
				parse_mode: 'HTML',
				link_preview_options: { is_disabled: true }
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (cause) {
		// Мережа або таймаут — саме той випадок, коли друга спроба допомагає.
		return { ok: false, retry: true, why: `запит не дійшов: ${String(cause)}` };
	}

	if (response.ok) return { ok: true };

	// Тіло відповіді Telegram — JSON із описом; якщо ні, беремо як текст.
	const raw = await response.text().catch(() => '');
	let description = raw;
	let retryAfterMs: number | undefined;
	let migrateTo: number | undefined;
	try {
		const payload = JSON.parse(raw) as {
			description?: string;
			parameters?: { retry_after?: number; migrate_to_chat_id?: number };
		};
		description = payload.description ?? raw;
		if (payload.parameters?.retry_after) retryAfterMs = payload.parameters.retry_after * 1000;
		migrateTo = payload.parameters?.migrate_to_chat_id;
	} catch {
		// Не JSON — лишаємо як є.
	}

	if (migrateTo) {
		return {
			ok: false,
			retry: false,
			why: `групу перетворено на супергрупу — новий TELEGRAM_CHAT_ID: ${migrateTo}`
		};
	}

	if (response.status === 429) {
		return {
			ok: false,
			retry: true,
			waitMs: Math.min(retryAfterMs ?? BACKOFF_MS[0], MAX_RETRY_AFTER_MS),
			why: `перевищено ліміт (${description})`
		};
	}

	if (response.status >= 500) {
		return { ok: false, retry: true, why: `Telegram відповів ${response.status}` };
	}

	return { ok: false, retry: false, why: explain(response.status, description, chatId) };
}

/**
 * Надіслати текст у робочу групу. Повертає, чи вийшло, але не кидає
 * винятків: жоден виклик не має валити те, що його викликало.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
	if (!isTelegramConfigured()) return false;

	for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
		const result = await attemptSend(text);
		if (result.ok) return true;

		if (!result.retry) {
			console.error(`[telegram] не надіслано, повторювати немає сенсу: ${result.why}`);
			return false;
		}

		const last = attempt === ATTEMPTS - 1;
		if (last) {
			console.error(`[telegram] не надіслано після ${ATTEMPTS} спроб: ${result.why}`);
			return false;
		}

		const wait = result.waitMs ?? BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
		console.warn(
			`[telegram] спроба ${attempt + 1} не вдалась (${result.why}), ще раз за ${wait} мс`
		);
		await sleep(wait);
	}

	return false;
}

export async function notifyNewOrder(order: OrderNotification): Promise<boolean> {
	if (!isTelegramConfigured()) return false;

	try {
		return await sendTelegramMessage(buildOrderMessage(order));
	} catch (cause) {
		// Сюда потрапити не мусимо — але якщо складання тексту колись
		// зламається, замовлення все одно має пройти.
		console.error('[telegram] не вдалося скласти повідомлення', cause);
		return false;
	}
}
