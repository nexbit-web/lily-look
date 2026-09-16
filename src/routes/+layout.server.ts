import { CATALOG_CACHE_MS } from '$lib/config';
import { cached } from '$lib/server/cache';
import { readCart } from '$lib/server/cart';
import { listCategories } from '$lib/server/catalog';
import { isDatabaseConfigured } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	// На /setup бази ще немає — віддаємо порожній каркас, щоб шапка відрендерилась.
	if (!isDatabaseConfigured()) {
		return { categories: [], cartCount: 0 };
	}

	// Меню однакове для всіх — тримаємо його в пам'яті; кошик у кожного свій
	// і читається щоразу.
	const [categories, cart] = await Promise.all([
		cached('categories', CATALOG_CACHE_MS, listCategories),
		readCart(cookies)
	]);

	return { categories, cartCount: cart.count };
};
