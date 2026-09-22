import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Вхід для Telegram.
 *
 * Адреса публічна, тож єдине, що відділяє її від сторонніх, — секрет у
 * заголовку. Це найкоротший шлях до чужих замовлень, якщо його забути
 * перевірити, тому перевіряється він тут насамперед.
 */

const env = {
	TELEGRAM_WEBHOOK_SECRET: 'secret-token'
} as Record<string, string | undefined>;

const access = { alreadyHandled: vi.fn() };
const handlers = { handleUpdate: vi.fn() };

vi.mock('$env/dynamic/private', () => ({ env }));
vi.mock('$lib/server/bot/access', () => access);
vi.mock('$lib/server/bot/handlers', () => handlers);

const { POST } = await import('./+server.js');

const call = (secret: string | null, body: unknown = { update_id: 1, message: {} }) => {
	const headers = new Headers({ 'content-type': 'application/json' });
	if (secret !== null) headers.set('x-telegram-bot-api-secret-token', secret);

	return POST({
		request: new Request('https://lilylook.store/api/telegram/webhook', {
			method: 'POST',
			headers,
			body: JSON.stringify(body)
		}),
		url: new URL('https://lilylook.store/api/telegram/webhook')
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
};

beforeEach(() => {
	env.TELEGRAM_WEBHOOK_SECRET = 'secret-token';
	access.alreadyHandled.mockReset().mockResolvedValue(false);
	handlers.handleUpdate.mockReset().mockResolvedValue(undefined);
});

describe('секрет', () => {
	it('правильний секрет пропускає', async () => {
		const response = await call('secret-token');

		expect(response.status).toBe(200);
		expect(handlers.handleUpdate).toHaveBeenCalled();
	});

	it('чужий секрет не пропускає й нічого не обробляє', async () => {
		const response = await call('wrong');

		expect(response.status).toBe(403);
		expect(handlers.handleUpdate).not.toHaveBeenCalled();
	});

	it('заголовка немає взагалі — те саме', async () => {
		const response = await call(null);

		expect(response.status).toBe(403);
		expect(handlers.handleUpdate).not.toHaveBeenCalled();
	});

	/**
	 * Поки секрет не заданий, вебхука наче й немає: 404, а не 403 — щоб
	 * випадковий перехожий не бачив, що тут щось є.
	 */
	it('секрет не налаштований — роут прикидається неіснуючим', async () => {
		env.TELEGRAM_WEBHOOK_SECRET = '';
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = await call('secret-token');

		expect(response.status).toBe(404);
		expect(handlers.handleUpdate).not.toHaveBeenCalled();
	});
});

describe('повтори й сміття', () => {
	/**
	 * Telegram шле подію знову, якщо не дочекався 200, — а холодний старт
	 * хостингу саме той випадок. Двічі спрацювати вона не має.
	 */
	it('уже оброблений апдейт другий раз не виконується', async () => {
		access.alreadyHandled.mockResolvedValue(true);

		const response = await call('secret-token');

		expect(response.status).toBe(200);
		expect(handlers.handleUpdate).not.toHaveBeenCalled();
	});

	it('не-JSON не валить роут', async () => {
		const response = await POST({
			request: new Request('https://lilylook.store/api/telegram/webhook', {
				method: 'POST',
				headers: { 'x-telegram-bot-api-secret-token': 'secret-token' },
				body: 'не json'
			}),
			url: new URL('https://lilylook.store/api/telegram/webhook')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(response.status).toBe(200);
		expect(handlers.handleUpdate).not.toHaveBeenCalled();
	});

	it('апдейт без номера ігнорується', async () => {
		const response = await call('secret-token', { message: {} });

		expect(response.status).toBe(200);
		expect(handlers.handleUpdate).not.toHaveBeenCalled();
	});
});
