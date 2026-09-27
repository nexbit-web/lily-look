import { describe, expect, it, vi } from 'vitest';

/** Сторінка замовлення відкривається лише за справжнім номером. */

const getOrderByNumber = vi.fn();

vi.mock('$lib/server/orders', () => ({ getOrderByNumber }));

const { load } = await import('$routes/order/[number]/+page.server');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (number: string) => (load as any)({ params: { number } });

describe('сторінка замовлення', () => {
	it('відома — віддає замовлення', async () => {
		getOrderByNumber.mockResolvedValue({ number: 'LL-ABC234' });

		await expect(open('LL-ABC234')).resolves.toEqual({ order: { number: 'LL-ABC234' } });
	});

	it('невідомий номер — 404', async () => {
		getOrderByNumber.mockResolvedValue(null);

		await expect(open('LL-NOPE22')).rejects.toMatchObject({ status: 404 });
	});
});
