import { FREE_DELIVERY_FROM } from '$lib/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estimateDeliveryPrice = vi.fn();
vi.mock('./nova-poshta.js', () => ({ estimateDeliveryPrice }));

const { resolveDeliveryCost } = await import('./delivery-cost.js');

beforeEach(() => estimateDeliveryPrice.mockReset());

const base = { subtotal: 100_000, itemCount: 1 };

describe('resolveDeliveryCost', () => {
	it('самовивіз безкоштовний і не турбує API', async () => {
		await expect(resolveDeliveryCost({ ...base, method: 'PICKUP', cityRef: 'ref' })).resolves.toBe(
			0
		);
		expect(estimateDeliveryPrice).not.toHaveBeenCalled();
	});

	it('від порогу безкоштовно — тариф не питаємо', async () => {
		const cost = await resolveDeliveryCost({
			...base,
			subtotal: FREE_DELIVERY_FROM,
			method: 'NOVA_POSHTA_BRANCH',
			cityRef: 'ref'
		});

		expect(cost).toBe(0);
		expect(estimateDeliveryPrice).not.toHaveBeenCalled();
	});

	it('бере живий тариф Нової Пошти', async () => {
		estimateDeliveryPrice.mockResolvedValue(9800);

		const cost = await resolveDeliveryCost({
			...base,
			method: 'NOVA_POSHTA_BRANCH',
			cityRef: 'city-ref'
		});

		expect(cost).toBe(9800);
		expect(estimateDeliveryPrice).toHaveBeenCalledWith({
			cityRef: 'city-ref',
			declaredValue: 100_000,
			itemCount: 1,
			toDoors: false
		});
	});

	it('для кур’єра просить тариф «до дверей»', async () => {
		estimateDeliveryPrice.mockResolvedValue(16_100);

		await resolveDeliveryCost({ ...base, method: 'NOVA_POSHTA_COURIER', cityRef: 'city-ref' });

		expect(estimateDeliveryPrice).toHaveBeenCalledWith(expect.objectContaining({ toDoors: true }));
	});

	it('якщо API мовчить — падає на фіксовану ставку, а не на помилку', async () => {
		estimateDeliveryPrice.mockResolvedValue(null);

		await expect(
			resolveDeliveryCost({ ...base, method: 'NOVA_POSHTA_BRANCH', cityRef: 'city-ref' })
		).resolves.toBe(9000);
	});

	it('без ref міста не ходить в API', async () => {
		const cost = await resolveDeliveryCost({ ...base, method: 'NOVA_POSHTA_BRANCH' });

		expect(cost).toBe(9000);
		expect(estimateDeliveryPrice).not.toHaveBeenCalled();
	});

	it('для Укрпошти тариф НП не питає навіть із ref', async () => {
		const cost = await resolveDeliveryCost({
			...base,
			method: 'UKRPOSHTA_BRANCH',
			cityRef: 'city-ref'
		});

		expect(cost).toBe(6000);
		expect(estimateDeliveryPrice).not.toHaveBeenCalled();
	});
});
