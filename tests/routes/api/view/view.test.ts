import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Перехід усередині сайту: браузер шле адресу, сервер кладе перегляд у
 * пам'ять. Будь-хто може надіслати сюди що завгодно, тож приймаємо лише
 * схоже на адресу сторінки.
 */

const identify = vi.fn();
const track = vi.fn();
const visitor = { id: 'abc123def456ghi789jk', source: 'direct', device: 'desktop' };

vi.mock('$lib/server/analytics', () => ({ identify, track }));

const { POST } = await import('$routes/api/view/+server');

function send(body: string) {
	const url = new URL('https://lilylook.store/api/view');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (POST as any)({ url, request: new Request(url, { method: 'POST', body }), cookies: {} });
}

beforeEach(() => {
	vi.clearAllMocks();
	identify.mockReturnValue(visitor);
});

describe('/api/view', () => {
	it('адреса сторінки — перегляд записаний, відповідь порожня', async () => {
		const response: Response = await send('/product/palto');

		expect(response.status).toBe(204);
		expect(track).toHaveBeenCalledWith(visitor, 'view', '/product/palto');
	});

	it.each([
		['не адреса', 'hello'],
		['чужий сайт', 'https://evil.example/'],
		['порожньо', ''],
		['задовга', `/${'a'.repeat(300)}`]
	])('%s — 400, нічого не записано', async (_case, body) => {
		const response: Response = await send(body);

		expect(response.status).toBe(400);
		expect(track).not.toHaveBeenCalled();
	});

	it('бот чи пристрій команди — відповідь та сама, але без запису', async () => {
		identify.mockReturnValue(null);

		const response: Response = await send('/cart');

		expect(response.status).toBe(204);
		expect(track).not.toHaveBeenCalled();
	});
});
