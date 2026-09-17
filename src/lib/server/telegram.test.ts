import type { OrderMessage } from '$lib/order-message';
import type { CartLine } from '$lib/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Надійність відправки.
 *
 * Формат повідомлення перевіряється окремо (`$lib/order-message`), а тут —
 * поведінка під відмовами. Два правила, які не мають порушуватись ніколи:
 * замовлення проходить, навіть коли Telegram лежить; і повторні спроби
 * робляться лише там, де від них є сенс, — марно довбати чужий API через
 * неправильний токен ніхто не буде.
 */

const env = {
	TELEGRAM_BOT_TOKEN: 'bot-token',
	TELEGRAM_CHAT_ID: '-1001234567890'
} as Record<string, string | undefined>;

vi.mock('$env/dynamic/private', () => ({ env }));

const { isTelegramConfigured, notifyNewOrder, sendTelegramMessage } = await import('./telegram.js');

const line: CartLine = {
	id: 'item-1',
	variantId: 'var-1',
	productName: 'Сукня Olivia',
	productSlug: 'suknia-olivia',
	size: 'M',
	color: 'Пудровий',
	imageUrl: null,
	unitPrice: 264_900,
	quantity: 1,
	lineTotal: 264_900,
	stock: 5
};

const order: OrderMessage = {
	number: 'LL-ABC234',
	customerName: 'Олена Коваль',
	customerPhone: '+380671234567',
	customerEmail: null,
	method: 'NOVA_POSHTA_BRANCH',
	city: 'Одеса',
	address: 'Відділення № 12',
	comment: '',
	lines: [line],
	subtotal: 264_900,
	deliveryCost: 9800,
	total: 274_700,
	payment: 'Оплата при отриманні'
};

const fetchMock = vi.fn();

const ok = () => ({ ok: true, status: 200, text: async () => '{"ok":true}' });
const fail = (status: number, payload: unknown) => ({
	ok: false,
	status,
	text: async () => JSON.stringify(payload)
});

/** Прогнати всі паузи між спробами. */
const runRetries = () => vi.advanceTimersByTimeAsync(60_000);

const errorLog = () =>
	(console.error as unknown as { mock: { calls: string[][] } }).mock.calls.flat().join('\n');

beforeEach(() => {
	vi.useFakeTimers();
	env.TELEGRAM_BOT_TOKEN = 'bot-token';
	env.TELEGRAM_CHAT_ID = '-1001234567890';
	fetchMock.mockReset();
	fetchMock.mockResolvedValue(ok());
	vi.stubGlobal('fetch', fetchMock);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('налаштування', () => {
	it('без токена або чату нічого не шле й нічого не ламає', async () => {
		env.TELEGRAM_BOT_TOKEN = '';

		expect(isTelegramConfigured()).toBe(false);
		await expect(notifyNewOrder(order)).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('шле в налаштований чат, розміткою HTML і з таймаутом', async () => {
		await notifyNewOrder(order);

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('/botbot-token/sendMessage');
		const body = JSON.parse(init.body);
		expect(body.chat_id).toBe('-1001234567890');
		expect(body.parse_mode).toBe('HTML');
		expect(body.text).toContain('LL-ABC234');
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});
});

describe('тимчасова відмова — пробуємо ще', () => {
	it('мережа не відповіла: друга спроба доносить повідомлення', async () => {
		fetchMock.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(ok());

		const sending = sendTelegramMessage('текст');
		await runRetries();

		await expect(sending).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('Telegram відповів 500: теж пробуємо ще', async () => {
		fetchMock.mockResolvedValueOnce(fail(502, {})).mockResolvedValue(ok());

		const sending = sendTelegramMessage('текст');
		await runRetries();

		await expect(sending).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('ліміт запитів: чекаємо саме стільки, скільки просить Telegram', async () => {
		fetchMock
			.mockResolvedValueOnce(
				fail(429, { description: 'Too Many Requests', parameters: { retry_after: 7 } })
			)
			.mockResolvedValue(ok());

		const sending = sendTelegramMessage('текст');

		// За шість секунд другої спроби ще немає — Telegram просив сім.
		await vi.advanceTimersByTimeAsync(6000);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(2000);
		await expect(sending).resolves.toBe(true);
	});

	it('три невдачі поспіль — здаємось і пишемо в лог', async () => {
		fetchMock.mockResolvedValue(fail(503, {}));

		const sending = sendTelegramMessage('текст');
		await runRetries();

		await expect(sending).resolves.toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(errorLog()).toContain('після 3 спроб');
	});
});

describe('остаточна відмова — не довбаємо API марно', () => {
	it('неправильний токен: одна спроба й підказка, де взяти новий', async () => {
		fetchMock.mockResolvedValue(fail(401, { description: 'Unauthorized' }));

		const sending = sendTelegramMessage('текст');
		await runRetries();

		await expect(sending).resolves.toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(errorLog()).toContain('TELEGRAM_BOT_TOKEN');
		expect(errorLog()).toContain('BotFather');
	});

	it('чат не знайдено: підказка саме про TELEGRAM_CHAT_ID', async () => {
		fetchMock.mockResolvedValue(fail(400, { description: 'Bad Request: chat not found' }));

		const sending = sendTelegramMessage('текст');
		await runRetries();

		await expect(sending).resolves.toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(errorLog()).toContain('TELEGRAM_CHAT_ID');
	});

	it('бота вигнали з групи: так і кажемо', async () => {
		fetchMock.mockResolvedValue(fail(403, { description: 'Forbidden: bot was kicked' }));

		const sending = sendTelegramMessage('текст');
		await runRetries();

		await expect(sending).resolves.toBe(false);
		expect(errorLog()).toContain('не може писати в чат');
	});

	it('група стала супергрупою: у лог іде новий chat_id', async () => {
		fetchMock.mockResolvedValue(
			fail(400, {
				description: 'Bad Request: group chat was upgraded to a supergroup chat',
				parameters: { migrate_to_chat_id: -1009876543210 }
			})
		);

		const sending = sendTelegramMessage('текст');
		await runRetries();

		await expect(sending).resolves.toBe(false);
		expect(errorLog()).toContain('-1009876543210');
	});
});

describe('замовлення важливіше за повідомлення', () => {
	it('Telegram лежить — виклик не кидає винятку', async () => {
		fetchMock.mockRejectedValue(new Error('network down'));

		const sending = notifyNewOrder(order);
		await runRetries();

		await expect(sending).resolves.toBe(false);
	});

	it('відповідь не JSON — теж не кидає', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => '<html>502</html>' });

		const sending = notifyNewOrder(order);
		await runRetries();

		await expect(sending).resolves.toBe(false);
	});

	it('тіло відповіді не прочиталось — теж не кидає', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => {
				throw new Error('stream closed');
			}
		});

		const sending = notifyNewOrder(order);
		await runRetries();

		await expect(sending).resolves.toBe(false);
	});
});
