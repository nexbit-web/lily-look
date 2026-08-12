import { readCart } from '$lib/server/cart';
import { listCategories } from '$lib/server/catalog';
import { isDatabaseConfigured } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	// На /setup бази ще немає — віддаємо порожній каркас, щоб шапка відрендерилась.
	if (!isDatabaseConfigured()) {
		return { categories: [], cartCount: 0 };
	}

	const [categories, cart] = await Promise.all([listCategories(), readCart(cookies)]);

	return { categories, cartCount: cart.count };
};
