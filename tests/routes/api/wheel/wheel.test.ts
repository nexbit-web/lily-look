import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Показ колеса: браузер шле адресу сторінки, поверх якої з'явилось вікно,
 * сервер кладе подію `wheel_shown` у пам'ять. Приймаємо лише схоже на
 * адресу сторінки.
 */

const identify = vi.fn();
const track = vi.fn();
const visitor = { id: 'abc123def456ghi789jk', source: 'facebook', device: 'mobile' };

vi.mock('$lib/server/analytics', () => ({ identify, track }));

const { POST } = await import('$routes/api/wheel/+server');

function send(body: string) {
	const url = new URL('https://lilylook.store/api/wheel');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (POST as any)({ url, request: new Request(url, { method: 'POST', body }), cookies: {} });
}

beforeEach(() => {
	vi.clearAllMocks();
	identify.mockReturnValue(visitor);
});

describe('/api/wheel', () => {
	it('показ колеса записаний разом зі сторінкою', async () => {
		const response: Response = await send('/product/palto');

		expect(response.status).toBe(204);
		expect(track).toHaveBeenCalledWith(visitor, 'wheel_shown', '/product/palto');
	});

	it('не адреса сторінки — 400, нічого не записано', async () => {
		const response: Response = await send('https://evil.example/');

		expect(response.status).toBe(400);
		expect(track).not.toHaveBeenCalled();
	});

	it('бот чи пристрій команди — без запису', async () => {
		identify.mockReturnValue(null);

		const response: Response = await send('/');

		expect(response.status).toBe(204);
		expect(track).not.toHaveBeenCalled();
	});
});
