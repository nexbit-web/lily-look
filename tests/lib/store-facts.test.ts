import { DELIVERY_METHODS, FREE_DELIVERY_FROM } from '$lib/config';
import { formatPrice } from '$lib/money';
import { deliveryPriceLabel, deliveryTerms, FACTS, telHref } from '$lib/store-facts';
import { describe, expect, it } from 'vitest';

/**
 * Умови магазину словами. Їх цитують сторінки умов і ІІ-асистенти, тож
 * тут перевіряємо головне: сайт ніде не називає суму доставки, якої не
 * може гарантувати.
 */

describe('доставка словами', () => {
	it('жодної суми доставки: самовивіз безкоштовно, решта — за тарифом перевізника', () => {
		for (const term of deliveryTerms()) {
			expect(term.price).toMatch(/^(безкоштовно|за тарифом перевізника)$/);
		}
		expect(deliveryTerms()).toHaveLength(DELIVERY_METHODS.length);
	});

	it('поріг безкоштовної доставки — з config, у гривнях', () => {
		expect(FACTS.freeDelivery).toContain(formatPrice(FREE_DELIVERY_FROM));
		expect(FACTS.carrierTariff).toContain(formatPrice(FREE_DELIVERY_FROM));
	});
});

describe('доставка в підсумку замовлення', () => {
	it('менше порогу — за тарифом перевізника', () => {
		expect(
			deliveryPriceLabel({
				method: 'NOVA_POSHTA_BRANCH',
				subtotal: FREE_DELIVERY_FROM - 1,
				deliveryCost: 0
			})
		).toBe('За тарифом перевізника');
	});

	it('від порогу — безкоштовно', () => {
		expect(
			deliveryPriceLabel({
				method: 'NOVA_POSHTA_BRANCH',
				subtotal: FREE_DELIVERY_FROM,
				deliveryCost: 0
			})
		).toBe('Безкоштовно');
	});

	it('самовивіз — завжди безкоштовно', () => {
		expect(deliveryPriceLabel({ method: 'PICKUP', subtotal: 100, deliveryCost: 0 })).toBe(
			'Безкоштовно'
		);
	});

	it('старе замовлення з сумою доставки показує ту суму, яку бачив покупець', () => {
		expect(
			deliveryPriceLabel({ method: 'NOVA_POSHTA_BRANCH', subtotal: 100, deliveryCost: 9000 })
		).toBe(formatPrice(9000));
	});
});

describe('посилання для дзвінка', () => {
	it('лише цифри з плюсом — інакше телефон набере місцевий номер', () => {
		expect(telHref('+38 (067) 658-34-86')).toBe('tel:+380676583486');
	});
});
