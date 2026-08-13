import type { CartLine } from '$lib/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = {
	TELEGRAM_BOT_TOKEN: 'bot-token',
	TELEGRAM_CHAT_ID: '-1001234567890'
} as Record<string, string | undefined>;

vi.mock('$env/dynamic/private', () => ({ env }));

const { isTelegramConfigured, notifyNewOrder } = await import('./telegram.js');

const fetchMock = vi.fn();

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

const order = {
	number: 'LL-ABC234',
	customerName: 'Олена Коваль',
	customerPhone: '+380671234567',
	customerEmail: null,
	method: 'NOVA_POSHTA_BRANCH' as const,
	city: 'Одеса',
	address: 'Відділення № 12',
	comment: '',
	lines: [line],
	subtotal: 264_900,
	deliveryCost: 9800,
	total: 274_700
};

const sentMessage = () => JSON.parse(fetchMock.mock.calls[0][1].body).text as string;

beforeEach(() => {
	env.TELEGRAM_BOT_TOKEN = 'bot-token';
	env.TELEGRAM_CHAT_ID = '-1001234567890';
	fetchMock.mockReset();
	fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' } as Response);
	vi.stubGlobal('fetch', fetchMock);
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.unstubAllGlobals());

describe('налаштування', () => {
	it('без токена або чату нічого не шле', async () => {
		env.TELEGRAM_BOT_TOKEN = '';
		expect(isTelegramConfigured()).toBe(false);

		await notifyNewOrder(order);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('повідомлення', () => {
	it('містить номер, покупця, доставку й суми', async () => {
		await notifyNewOrder(order);

		const text = sentMessage();
		expect(text).toContain('LL-ABC234');
		expect(text).toContain('Олена Коваль');
		expect(text).toContain('+380671234567');
		expect(text).toContain('Одеса, Відділення № 12');
		expect(text).toContain('Сукня Olivia');
	});

	it('екранує HTML у даних покупця — інакше parse_mode ламається', async () => {
		await notifyNewOrder({
			...order,
			customerName: '<b>Олена</b> & Ко',
			comment: '<a href="evil">клік</a>'
		});

		const text = sentMessage();
		expect(text).toContain('&lt;b&gt;Олена&lt;/b&gt; &amp; Ко');
		expect(text).toContain('&lt;a href=');
		expect(text).not.toContain('<b>Олена');
	});

	it('шле в налаштований чат із таймаутом', async () => {
		await notifyNewOrder(order);

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('/botbot-token/sendMessage');
		expect(JSON.parse(init.body).chat_id).toBe('-1001234567890');
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});
});

describe('надійність', () => {
	it('впав Telegram — замовлення все одно проходить', async () => {
		fetchMock.mockRejectedValue(new Error('network down'));
		await expect(notifyNewOrder(order)).resolves.toBeUndefined();
	});

	it('відповідь 400 теж не кидає виняток', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => 'chat not found'
		} as Response);

		await expect(notifyNewOrder(order)).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});
});
