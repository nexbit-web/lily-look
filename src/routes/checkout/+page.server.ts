import { checkoutSchema, fieldErrors, validateDelivery } from '$lib/schemas';
import { countCartItems, readCart } from '$lib/server/cart';
import { isNovaPoshtaConfigured } from '$lib/server/nova-poshta';
import { createOrder } from '$lib/server/orders';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	// Гард робимо дешевим count-запитом, а сам кошик віддаємо стрімом:
	// каркас форми доїжджає одразу, позиції — коли будуть готові.
	if ((await countCartItems(cookies)) === 0) redirect(303, '/cart');

	return {
		cart: readCart(cookies),
		// За цим прапорцем UI вирішує: підбір адреси чи звичайні поля.
		novaPoshtaLive: isNovaPoshtaConfigured()
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const values = Object.fromEntries(form) as Record<string, string>;

		const parsed = checkoutSchema.safeParse(values);
		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.error), values });
		}

		const deliveryErrors = validateDelivery(parsed.data);
		if (Object.keys(deliveryErrors).length) {
			return fail(400, { errors: deliveryErrors, values });
		}

		const result = await createOrder(cookies, parsed.data);
		if (!result.ok) {
			return fail(400, { message: result.message, values });
		}

		// Онлайн-провайдер може повернути свою сторінку оплати;
		// у режимі "оплата при отриманні" redirectUrl порожній.
		redirect(303, result.redirectUrl ?? `/order/${result.number}`);
	}
};
