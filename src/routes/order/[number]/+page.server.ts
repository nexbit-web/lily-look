import { getOrderByNumber } from '$lib/server/orders';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const order = await getOrderByNumber(params.number);
	if (!order) error(404, 'Замовлення не знайдено');

	return { order };
};
