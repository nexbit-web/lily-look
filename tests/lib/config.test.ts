import { describe, expect, it } from 'vitest';
import {
	DELIVERY_METHODS,
	deliveryCostFor,
	deliveryMethod,
	FREE_DELIVERY_FROM,
	SENDER
} from '$lib/config';

describe('способи доставки', () => {
	it('мають унікальні значення — це ключі в БД', () => {
		const values = DELIVERY_METHODS.map((method) => method.value);
		expect(new Set(values).size).toBe(values.length);
	});

	it('автопідбір адреси вмикається тільки для Нової Пошти', () => {
		for (const method of DELIVERY_METHODS) {
			if (method.carrier !== null) expect(method.carrier).toBe('nova-poshta');
		}
	});

	it('невідомий спосіб не валить сторінку, а падає на перший', () => {
		expect(deliveryMethod('НЕМАЄ' as never)).toBe(DELIVERY_METHODS[0]);
	});
});

describe('deliveryCostFor', () => {
	it('нижче порогу бере тариф способу доставки', () => {
		expect(deliveryCostFor('NOVA_POSHTA_BRANCH', FREE_DELIVERY_FROM - 1)).toBe(9000);
	});

	it('від порогу — безкоштовно', () => {
		expect(deliveryCostFor('NOVA_POSHTA_BRANCH', FREE_DELIVERY_FROM)).toBe(0);
		expect(deliveryCostFor('NOVA_POSHTA_COURIER', FREE_DELIVERY_FROM + 1)).toBe(0);
	});

	it('самовивіз безкоштовний завжди', () => {
		expect(deliveryCostFor('PICKUP', 0)).toBe(0);
	});
});

describe('відправник', () => {
	it('має ref міста для розрахунку тарифу НП', () => {
		expect(SENDER.cityRef).toMatch(/^[0-9a-f-]{36}$/);
	});
});
