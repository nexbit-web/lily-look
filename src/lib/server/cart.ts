import type { CartLine, CartView } from '$lib/types';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db.js';

/**
 * Кошик серверний: у куці лежить лише його id, усі ціни й залишки
 * перераховуються з БД. Клієнт не може підкрутити суму, а сам кошик
 * переживає перезавантаження й закриття вкладки.
 */

const CART_COOKIE = 'lily_cart';
const CART_MAX_AGE = 60 * 60 * 24 * 30; // 30 днів

export const EMPTY_CART: CartView = { id: null, lines: [], subtotal: 0, count: 0 };

export type CartResult = { ok: true; cart: CartView } | { ok: false; message: string };

const LINE_INCLUDE = {
	variant: {
		select: {
			id: true,
			size: true,
			color: true,
			stock: true,
			isActive: true,
			// Ціни беремо ті, що порахувала база: знижка вже врахована.
			finalPrice: true,
			product: {
				select: {
					name: true,
					slug: true,
					finalPrice: true,
					isActive: true,
					images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 }
				}
			}
		}
	}
} as const;

/**
 * Кеш на час одного HTTP-запиту.
 *
 * Кошик читає і layout (лічильник у шапці), і сторінка /cart — без кешу це
 * два однакові запити до БД на кожен показ. Об'єкт `cookies` створюється раз
 * на запит і той самий приходить у всі load-функції та actions, тож WeakMap
 * звільняє пам'ять сам. Кожна мутація скидає запис: після POST у тому ж
 * запиті перезапускаються load-функції, і вони мають побачити новий кошик.
 */
const cartCache = new WeakMap<Cookies, Promise<CartView>>();

function forgetCart(cookies: Cookies): void {
	cartCache.delete(cookies);
}

export function readCart(cookies: Cookies): Promise<CartView> {
	const cached = cartCache.get(cookies);
	if (cached) return cached;

	const pending = loadCart(cookies);
	cartCache.set(cookies, pending);
	return pending;
}

async function loadCart(cookies: Cookies): Promise<CartView> {
	const cartId = cookies.get(CART_COOKIE);
	if (!cartId) return EMPTY_CART;

	const cart = await db.cart.findUnique({
		where: { id: cartId },
		select: {
			id: true,
			items: { include: LINE_INCLUDE, orderBy: { id: 'asc' } }
		}
	});

	// Куки живуть довше за дані (напр. після скидання БД) — тихо ігноруємо.
	if (!cart) return EMPTY_CART;

	const lines: CartLine[] = cart.items
		// Товар або розмір могли вимкнути в CRM, поки кошик лежав.
		.filter((item) => item.variant.product.isActive && item.variant.isActive)
		.map((item) => {
			const unitPrice = item.variant.finalPrice ?? item.variant.product.finalPrice;
			// Залишок міг зменшитись, поки кошик лежав: не даємо замовити більше.
			const quantity = Math.min(item.quantity, item.variant.stock);
			return {
				id: item.id,
				variantId: item.variant.id,
				productName: item.variant.product.name,
				productSlug: item.variant.product.slug,
				size: item.variant.size,
				color: item.variant.color,
				imageUrl: item.variant.product.images[0]?.url ?? null,
				unitPrice,
				quantity,
				lineTotal: unitPrice * quantity,
				stock: item.variant.stock
			};
		})
		.filter((line) => line.quantity > 0);

	return {
		id: cart.id,
		lines,
		subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
		count: lines.reduce((sum, line) => sum + line.quantity, 0)
	};
}

/**
 * Скільки позицій у кошику. Дешевий запит для гардів на кшталт «чекаут
 * порожній — на /cart», щоб не тягнути весь кошик до першого байта відповіді.
 */
export async function countCartItems(cookies: Cookies): Promise<number> {
	const cartId = cookies.get(CART_COOKIE);
	if (!cartId) return 0;
	return db.cartItem.count({ where: { cartId } });
}

async function resolveCartId(cookies: Cookies): Promise<string> {
	const existingId = cookies.get(CART_COOKIE);
	if (existingId) {
		const found = await db.cart.findUnique({ where: { id: existingId }, select: { id: true } });
		if (found) return found.id;
	}

	const created = await db.cart.create({ data: {}, select: { id: true } });
	cookies.set(CART_COOKIE, created.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: CART_MAX_AGE
	});
	forgetCart(cookies);
	return created.id;
}

export async function addToCart(
	cookies: Cookies,
	variantId: string,
	quantity = 1
): Promise<CartResult> {
	const variant = await db.productVariant.findUnique({
		where: { id: variantId },
		select: { id: true, stock: true, isActive: true, product: { select: { isActive: true } } }
	});

	if (!variant || !variant.isActive || !variant.product.isActive) {
		return { ok: false, message: 'Такого товару вже немає в каталозі.' };
	}
	if (variant.stock < 1) {
		return { ok: false, message: 'Цього розміру зараз немає в наявності.' };
	}

	const cartId = await resolveCartId(cookies);
	const existing = await db.cartItem.findUnique({
		where: { cartId_variantId: { cartId, variantId } },
		select: { id: true, quantity: true }
	});

	const desired = (existing?.quantity ?? 0) + quantity;
	const clamped = Math.min(desired, variant.stock);

	if (existing) {
		await db.cartItem.update({ where: { id: existing.id }, data: { quantity: clamped } });
	} else {
		await db.cartItem.create({ data: { cartId, variantId, quantity: clamped } });
	}

	forgetCart(cookies);
	const cart = await readCart(cookies);
	if (clamped < desired) {
		return { ok: false, message: `Доступно лише ${variant.stock} шт. цього розміру.` };
	}
	return { ok: true, cart };
}

export async function setQuantity(
	cookies: Cookies,
	itemId: string,
	quantity: number
): Promise<CartResult> {
	const cartId = cookies.get(CART_COOKIE);
	if (!cartId) return { ok: false, message: 'Кошик порожній.' };

	// where з cartId — щоб не можна було правити чужий кошик за вгаданим id.
	const item = await db.cartItem.findFirst({
		where: { id: itemId, cartId },
		select: { id: true, variant: { select: { stock: true } } }
	});
	if (!item) return { ok: false, message: 'Позицію не знайдено.' };

	if (quantity < 1) return removeFromCart(cookies, itemId);

	const clamped = Math.min(quantity, item.variant.stock);
	await db.cartItem.update({ where: { id: item.id }, data: { quantity: clamped } });

	forgetCart(cookies);
	const cart = await readCart(cookies);
	if (clamped < quantity) {
		return { ok: false, message: `Доступно лише ${item.variant.stock} шт.` };
	}
	return { ok: true, cart };
}

export async function removeFromCart(cookies: Cookies, itemId: string): Promise<CartResult> {
	const cartId = cookies.get(CART_COOKIE);
	if (!cartId) return { ok: false, message: 'Кошик порожній.' };

	await db.cartItem.deleteMany({ where: { id: itemId, cartId } });

	forgetCart(cookies);
	return { ok: true, cart: await readCart(cookies) };
}

export async function clearCart(cookies: Cookies): Promise<void> {
	const cartId = cookies.get(CART_COOKIE);
	if (!cartId) return;
	await db.cartItem.deleteMany({ where: { cartId } });
	forgetCart(cookies);
}
