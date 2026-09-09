import { DELIVERY_METHODS, MAX_CART_QUANTITY } from '$lib/config';
import { deliveryWindow } from '$lib/delivery-estimate';
import { addToCart } from '$lib/server/cart';
import { getProduct, listRecommended } from '$lib/server/catalog';
import { breadcrumbsNode, productNode } from '$lib/server/seo';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const product = await getProduct(params.slug);
	if (!product) error(404, 'Такого товару не існує');

	const recommended = await listRecommended(product);

	// Картка товару в Google: ціна, наявність, розміри й умови повернення.
	// Хлібні крихти поруч — з ними у видачі замість URL видно шлях категорії.
	locals.jsonLd = [
		productNode(url.origin, product),
		breadcrumbsNode(url.origin, [
			{ name: 'Головна', path: '/' },
			{ name: 'Каталог', path: '/catalog' },
			{ name: product.category.name, path: `/catalog/${product.category.slug}` },
			{ name: product.name, path: `/product/${product.slug}` }
		])
	];

	// Дату отримання рахуємо на сервері: у браузері вона залежала б від
	// годинника покупця, і після гідратації рядок міг би змінитись на очах.
	const now = new Date();
	const delivery = DELIVERY_METHODS.map((method) => ({
		value: method.value,
		label: method.label,
		hint: method.hint,
		cost: method.cost,
		...deliveryWindow(now, method.days)
	}));

	return { product, recommended, delivery };
};

export const actions: Actions = {
	add: async ({ request, cookies }) => {
		const form = await request.formData();
		const variantId = String(form.get('variantId') ?? '');
		const raw = form.get('quantity');

		// Форму видно в DOM, тож кількість може прийти будь-яка. Дробова чи
		// відʼємна лягла б у кошик як є — і сума замовлення поїхала б у мінус.
		// Поле необовʼязкове: зі сторінки товару беруть одну річ. Порожній
		// рядок дає 0 і не проходить перевірку нижче — як і має бути.
		const quantity = raw === null ? 1 : Number(String(raw).trim());

		if (!variantId) {
			return fail(400, { message: 'Оберіть колір і розмір.' });
		}
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
			return fail(400, { message: 'Некоректна кількість.' });
		}

		const result = await addToCart(cookies, variantId, quantity);
		if (!result.ok) {
			return fail(400, { message: result.message });
		}

		return { added: true };
	}
};
