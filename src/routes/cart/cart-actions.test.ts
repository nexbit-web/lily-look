import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Межа «браузер → сервер». Форму можна підробити повністю, тому action
 * зобов'язаний перевірити все сам — тут саме ці перевірки.
 */

const setQuantity = vi.fn();
const removeFromCart = vi.fn();
const readCart = vi.fn();

vi.mock('$lib/server/cart', () => ({ setQuantity, removeFromCart, readCart }));

const { actions } = await import('./+page.server.js');

function event(fields: Record<string, string>) {
	const body = new URLSearchParams(fields);
	return {
		request: new Request('http://localhost/cart', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body
		}),
		cookies: {} as RequestEvent['cookies']
	} as RequestEvent;
}

const update = (fields: Record<string, string>) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions.update as any)(event(fields));

const remove = (fields: Record<string, string>) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions.remove as any)(event(fields));

beforeEach(() => {
	setQuantity.mockResolvedValue({ ok: true, cart: { lines: [], subtotal: 0, count: 0 } });
	removeFromCart.mockResolvedValue({ ok: true, cart: { lines: [], subtotal: 0, count: 0 } });
});

describe('action update', () => {
	it('пропускає нормальний запит', async () => {
		await expect(update({ itemId: 'item-1', quantity: '3' })).resolves.toEqual({ updated: true });
		expect(setQuantity).toHaveBeenCalledWith(expect.anything(), 'item-1', 3);
	});

	it.each([
		['без quantity — інакше позиція тихо зникла б', { itemId: 'item-1' }],
		['без itemId', { quantity: '2' }],
		['дробова кількість', { itemId: 'item-1', quantity: '2.5' }],
		['відʼємна кількість', { itemId: 'item-1', quantity: '-3' }],
		['нечисло', { itemId: 'item-1', quantity: 'багато' }],
		['порожній рядок', { itemId: 'item-1', quantity: '' }],
		['нескінченність', { itemId: 'item-1', quantity: 'Infinity' }],
		['понад стелю', { itemId: 'item-1', quantity: '1000' }],
		['експонента', { itemId: 'item-1', quantity: '1e3' }]
	])('відбиває %s', async (_case, fields) => {
		const result = await update(fields);

		expect(result).toMatchObject({ status: 400 });
		expect(setQuantity).not.toHaveBeenCalled();
	});

	it('повідомлення від сервісу доходить до форми як помилка', async () => {
		setQuantity.mockResolvedValue({ ok: false, message: 'Доступно лише 2 шт.' });

		const result = await update({ itemId: 'item-1', quantity: '5' });
		expect(result).toMatchObject({ status: 400, data: { message: 'Доступно лише 2 шт.' } });
	});
});

describe('action remove', () => {
	it('видаляє за id', async () => {
		await expect(remove({ itemId: 'item-1' })).resolves.toEqual({ removed: true });
		expect(removeFromCart).toHaveBeenCalledWith(expect.anything(), 'item-1');
	});

	it('без id нічого не робить', async () => {
		const result = await remove({});

		expect(result).toMatchObject({ status: 400 });
		expect(removeFromCart).not.toHaveBeenCalled();
	});
});
