import { readCart } from '$lib/server/cart';
import { estimateDeliveryPrice } from '$lib/server/nova-poshta';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/nova-poshta/price?city=<cityRef>&doors=1
 *
 * Оголошену вартість і кількість місць беремо з кошика на сервері,
 * а не з параметрів: інакше ціну доставки можна було б занизити з клієнта.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const cityRef = url.searchParams.get('city');
	if (!cityRef) error(400, 'Не вказано місто');

	const cart = await readCart(cookies);
	if (cart.lines.length === 0) error(400, 'Кошик порожній');

	const cost = await estimateDeliveryPrice({
		cityRef,
		declaredValue: cart.subtotal,
		itemCount: cart.count,
		toDoors: url.searchParams.get('doors') === '1'
	});

	return json({ cost });
};
