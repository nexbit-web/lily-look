import { deliveryMethod, FREE_DELIVERY_FROM, type DeliveryMethodValue } from '$lib/config';
import { estimateDeliveryPrice } from './nova-poshta.js';

/**
 * Скільки коштує доставка для конкретного замовлення.
 *
 * Порядок рішень свідомо такий:
 *  1. Самовивіз — завжди безкоштовно.
 *  2. Замовлення від порогу — платимо ми, тариф перевізника не питаємо.
 *  3. Нова Пошта — реальний тариф із API під конкретний напрямок і вагу.
 *  4. Якщо API мовчить або перевізник інший — фіксована ставка з config.
 *
 * Ця ж функція рахує суму і для UI, і для замовлення, тож те, що бачить
 * покупець у підсумку, збігається з тим, що піде в базу.
 */
export async function resolveDeliveryCost(options: {
	method: DeliveryMethodValue;
	subtotal: number;
	itemCount: number;
	cityRef?: string;
}): Promise<number> {
	const { method, subtotal, itemCount, cityRef } = options;
	const config = deliveryMethod(method);

	if (config.kind === 'pickup') return 0;
	if (subtotal >= FREE_DELIVERY_FROM) return 0;

	if (config.carrier === 'nova-poshta' && cityRef) {
		const live = await estimateDeliveryPrice({
			cityRef,
			declaredValue: subtotal,
			itemCount,
			toDoors: config.kind === 'courier'
		});
		if (live !== null) return live;
	}

	return config.cost;
}
