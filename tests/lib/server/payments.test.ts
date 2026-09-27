import { DEFAULT_PAYMENT_PROVIDER, getPaymentProvider } from '$lib/server/payments';
import { describe, expect, it } from 'vitest';

/**
 * Оплата зараз одна — при отриманні. Головне: замовлення ніколи не веде
 * покупця на сторінку оплати, якої немає.
 */

const order = {
	id: 'o1',
	number: 'LL-ABC234',
	total: 264_900,
	customerName: 'Олена',
	customerEmail: null
};

describe('оплата', () => {
	it('за замовчуванням — при отриманні, без переходу на сторінку оплати', async () => {
		const provider = getPaymentProvider();

		expect(provider.id).toBe(DEFAULT_PAYMENT_PROVIDER);
		await expect(provider.createPayment(order)).resolves.toEqual({
			redirectUrl: null,
			reference: null
		});
	});

	it('невідомий провайдер не ламає замовлення — падаємо на оплату при отриманні', () => {
		expect(getPaymentProvider('stripe').id).toBe('manual');
	});
});
