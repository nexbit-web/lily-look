import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Межа «браузер → сервер» на сторінці товару. Форму видно в DOM і її можна
 * підробити повністю, тому action зобовʼязаний перевірити все сам —
 * особливо кількість: відʼємна лягла б у кошик як є й пустила б суму
 * замовлення в мінус.
 */

const addToCart = vi.fn();

vi.mock('$lib/server/cart', () => ({ addToCart }));
vi.mock('$lib/server/catalog', () => ({ getProduct: vi.fn(), listRecommended: vi.fn() }));

const { actions } = await import('./+page.server.js');

function event(fields: Record<string, string>) {
	return {
		request: new Request('http://localhost/product/suknia-olivia', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(fields)
		}),
		cookies: {} as RequestEvent['cookies']
	} as RequestEvent;
}

const add = (fields: Record<string, string>) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions.add as any)(event(fields));

beforeEach(() => {
	addToCart.mockResolvedValue({ ok: true, cart: { lines: [], subtotal: 0, count: 0 } });
});

describe('action add', () => {
	it('без кількості додає одну річ — саме так надсилає сторінка', async () => {
		await expect(add({ variantId: 'v-1' })).resolves.toEqual({ added: true });
		expect(addToCart).toHaveBeenCalledWith(expect.anything(), 'v-1', 1);
	});

	it('явна кількість доходить до кошика', async () => {
		await add({ variantId: 'v-1', quantity: '3' });
		expect(addToCart).toHaveBeenCalledWith(expect.anything(), 'v-1', 3);
	});

	it('без розміру просить його обрати', async () => {
		const result = await add({});

		expect(result).toMatchObject({ status: 400, data: { message: 'Оберіть колір і розмір.' } });
		expect(addToCart).not.toHaveBeenCalled();
	});

	it.each([
		['відʼємна кількість', { variantId: 'v-1', quantity: '-3' }],
		['дробова кількість', { variantId: 'v-1', quantity: '1.5' }],
		['нуль', { variantId: 'v-1', quantity: '0' }],
		['нечисло', { variantId: 'v-1', quantity: 'багато' }],
		['порожній рядок', { variantId: 'v-1', quantity: '' }],
		['нескінченність', { variantId: 'v-1', quantity: 'Infinity' }],
		['експонента', { variantId: 'v-1', quantity: '1e3' }],
		['понад стелю', { variantId: 'v-1', quantity: '100' }]
	])('відбиває %s', async (_case, fields) => {
		const result = await add(fields);

		expect(result).toMatchObject({ status: 400 });
		expect(addToCart).not.toHaveBeenCalled();
	});

	it('повідомлення від кошика доходить до форми як помилка', async () => {
		addToCart.mockResolvedValue({ ok: false, message: 'Доступно лише 2 шт. цього розміру.' });

		const result = await add({ variantId: 'v-1' });
		expect(result).toMatchObject({
			status: 400,
			data: { message: 'Доступно лише 2 шт. цього розміру.' }
		});
	});
});
