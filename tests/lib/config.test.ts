import { describe, expect, it } from 'vitest';
import {
	DELIVERY_METHODS,
	deliveryMethod,
	FREE_DELIVERY_FROM,
	isDeliveryFree,
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

describe('isDeliveryFree', () => {
	it('нижче порогу доставку платить покупець перевізнику', () => {
		expect(isDeliveryFree('NOVA_POSHTA_BRANCH', FREE_DELIVERY_FROM - 1)).toBe(false);
		expect(isDeliveryFree('UKRPOSHTA_BRANCH', 0)).toBe(false);
	});

	it('від порогу — безкоштовно будь-яким способом', () => {
		expect(isDeliveryFree('NOVA_POSHTA_BRANCH', FREE_DELIVERY_FROM)).toBe(true);
		expect(isDeliveryFree('NOVA_POSHTA_COURIER', FREE_DELIVERY_FROM + 1)).toBe(true);
	});

	it('самовивіз безкоштовний завжди', () => {
		expect(isDeliveryFree('PICKUP', 0)).toBe(true);
	});

	/** Фіксована «90 грн» обіцяла покупцеві суму, якої на пошті не було. */
	it('жоден спосіб доставки не несе вигаданої ціни', () => {
		for (const method of DELIVERY_METHODS) expect(method).not.toHaveProperty('cost');
	});
});

describe('відправник', () => {
	it('має ref міста для розрахунку тарифу НП', () => {
		expect(SENDER.cityRef).toMatch(/^[0-9a-f-]{36}$/);
	});
});
