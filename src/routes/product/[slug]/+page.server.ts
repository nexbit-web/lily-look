import { addToCart } from '$lib/server/cart';
import { getProduct, listRecommended } from '$lib/server/catalog';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const product = await getProduct(params.slug);
	if (!product) error(404, 'Такого товару не існує');

	const recommended = await listRecommended(product);

	return { product, recommended };
};

export const actions: Actions = {
	add: async ({ request, cookies }) => {
		const form = await request.formData();
		const variantId = String(form.get('variantId') ?? '');
		const quantity = Number(form.get('quantity') ?? 1);

		if (!variantId) {
			return fail(400, { message: 'Оберіть колір і розмір.' });
		}

		const result = await addToCart(cookies, variantId, Number.isFinite(quantity) ? quantity : 1);
		if (!result.ok) {
			return fail(400, { message: result.message });
		}

		return { added: true };
	}
};
