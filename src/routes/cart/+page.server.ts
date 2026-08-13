import { readCart, removeFromCart, setQuantity } from '$lib/server/cart';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** Стеля на випадок підробленої форми — реальний ліміт усе одно залишок. */
const MAX_QUANTITY = 99;

export const load: PageServerLoad = async ({ cookies }) => {
	return { cart: await readCart(cookies) };
};

export const actions: Actions = {
	update: async ({ request, cookies }) => {
		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '');
		const raw = form.get('quantity');

		// Порожнє поле й відсутнє поле — окремо: Number('') і Number(null)
		// дорівнюють нулю, тож підроблена форма тихо видалила б позицію.
		const quantity = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;

		if (!itemId || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
			return fail(400, { message: 'Некоректний запит.' });
		}

		const result = await setQuantity(cookies, itemId, quantity);
		if (!result.ok) return fail(400, { message: result.message });

		return { updated: true };
	},

	remove: async ({ request, cookies }) => {
		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '');
		if (!itemId) return fail(400, { message: 'Некоректний запит.' });

		const result = await removeFromCart(cookies, itemId);
		if (!result.ok) return fail(400, { message: result.message });

		return { removed: true };
	}
};
