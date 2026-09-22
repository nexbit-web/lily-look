import { env } from '$env/dynamic/private';

/**
 * Розмова з Telegram Bot API: один виклик, усі відомі способи впасти.
 *
 * Модуль навмисно нічого не знає ні про замовлення, ні про менеджерів —
 * лише «надіслати метод, отримати результат». Поверх нього живуть і старі
 * сповіщення в групу, і бот із кнопками, тож правила повторних спроб у них
 * однакові.
 *
 * Розділення відмов тут головне:
 *  — тимчасова (мережа, 5xx, 429) переживається повторними спробами, і при
 *    429 пауза така, яку назвав сам Telegram;
 *  — остаточна (поганий токен, бота вигнали) не повторюється марно, а
 *    пишеться в лог зрозумілою мовою — щоб було видно, що піти й виправити.
 */

const TIMEOUT_MS = 8000;
/** Разом із першою спробою. */
const ATTEMPTS = 3;
/** Пауза перед другою і третьою спробою. */
const BACKOFF_MS = [700, 2500];
/** Скільки погодимось чекати, якщо Telegram просить зачекати довго. */
const MAX_RETRY_AFTER_MS = 20_000;

export function isTelegramConfigured(): boolean {
	return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

/** Для бота чат не потрібен: він пише туди, звідки до нього прийшли. */
export function isBotConfigured(): boolean {
	return Boolean(env.TELEGRAM_BOT_TOKEN);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Attempt<T> =
	| { ok: true; result: T }
	/** Варто спробувати ще: мережа, 5xx, перевищений ліміт. */
	| { ok: false; retry: true; waitMs?: number; why: string }
	/** Повторювати немає сенсу: треба щось змінити в налаштуваннях. */
	| { ok: false; retry: false; why: string };

export type TelegramCall<T> = { ok: true; result: T } | { ok: false; why: string };

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

async function attempt<T>(method: string, payload: Record<string, unknown>): Promise<Attempt<T>> {
	const chatId = String(payload.chat_id ?? env.TELEGRAM_CHAT_ID ?? '');

	let response: Response;
	try {
		response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (cause) {
		// Мережа або таймаут — саме той випадок, коли друга спроба допомагає.
		return { ok: false, retry: true, why: `запит не дійшов: ${String(cause)}` };
	}

	// Тіло відповіді Telegram — JSON із описом; якщо ні, беремо як текст.
	const raw = await response.text().catch(() => '');
	let description = raw;
	let result: T | undefined;
	let retryAfterMs: number | undefined;
	let migrateTo: number | undefined;
	try {
		const payload = JSON.parse(raw) as {
			result?: T;
			description?: string;
			parameters?: { retry_after?: number; migrate_to_chat_id?: number };
		};
		result = payload.result;
		description = payload.description ?? raw;
		if (payload.parameters?.retry_after) retryAfterMs = payload.parameters.retry_after * 1000;
		migrateTo = payload.parameters?.migrate_to_chat_id;
	} catch {
		// Не JSON — лишаємо як є.
	}

	if (response.ok) return { ok: true, result: result as T };

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
 * Викликати метод Bot API. Не кидає винятків: жоден виклик не має валити
 * те, що його викликало — ні оформлення замовлення, ні обробку вебхука.
 */
export async function callTelegram<T>(
	method: string,
	payload: Record<string, unknown>
): Promise<TelegramCall<T>> {
	if (!isBotConfigured()) return { ok: false, why: 'TELEGRAM_BOT_TOKEN не заданий' };

	for (let index = 0; index < ATTEMPTS; index += 1) {
		const outcome = await attempt<T>(method, payload);
		if (outcome.ok) return { ok: true, result: outcome.result };

		if (!outcome.retry) {
			console.error(`[telegram] ${method}: не вийшло, повторювати немає сенсу: ${outcome.why}`);
			return { ok: false, why: outcome.why };
		}

		const last = index === ATTEMPTS - 1;
		if (last) {
			console.error(`[telegram] ${method}: не вийшло після ${ATTEMPTS} спроб: ${outcome.why}`);
			return { ok: false, why: outcome.why };
		}

		const wait = outcome.waitMs ?? BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
		console.warn(
			`[telegram] ${method}: спроба ${index + 1} не вдалась (${outcome.why}), ще раз за ${wait} мс`
		);
		await sleep(wait);
	}

	return { ok: false, why: 'вичерпано спроби' };
}

/** Клавіатура під повідомленням. Порожній масив рядків — прибрати кнопки. */
export type InlineButton = { text: string; callback_data: string };

export async function sendMessage(
	chatId: bigint | number | string,
	text: string,
	keyboard: InlineButton[][] = []
): Promise<TelegramCall<{ message_id: number }>> {
	return callTelegram('sendMessage', {
		chat_id: String(chatId),
		text,
		parse_mode: 'HTML',
		link_preview_options: { is_disabled: true },
		...(keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {})
	});
}

export async function editMessage(
	chatId: bigint | number | string,
	messageId: bigint | number,
	text: string,
	keyboard: InlineButton[][] = []
): Promise<TelegramCall<unknown>> {
	return callTelegram('editMessageText', {
		chat_id: String(chatId),
		message_id: Number(messageId),
		text,
		parse_mode: 'HTML',
		link_preview_options: { is_disabled: true },
		reply_markup: { inline_keyboard: keyboard }
	});
}

/**
 * Відповідь на натискання кнопки.
 *
 * Telegram чекає її близько 15 секунд, інакше в менеджера крутиться
 * годинник і вилазить «query is too old». Тому її надсилають першою,
 * ще до походу в базу, — і без повторних спроб: спізнена відповідь
 * нікому не потрібна.
 */
export async function answerCallback(id: string, text?: string): Promise<void> {
	try {
		await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch {
		// Кнопка покрутиться й відпустить. Статус від цього не залежить.
	}
}
