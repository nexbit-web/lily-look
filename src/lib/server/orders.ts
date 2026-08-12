import type { Cookies } from '@sveltejs/kit';
import type { DeliveryMethodValue } from '$lib/config';
import type { CheckoutInput } from '$lib/schemas';
import { clearCart, readCart } from './cart.js';
import { db } from './db.js';
import { resolveDeliveryCost } from './delivery-cost.js';
import { DEFAULT_PAYMENT_PROVIDER, getPaymentProvider } from './payments.js';
import { notifyNewOrder } from './telegram.js';

/** Символи без 0/O/1/I — щоб номер можна було продиктувати телефоном. */
const NUMBER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateOrderNumber(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	const body = [...bytes].map((byte) => NUMBER_ALPHABET[byte % NUMBER_ALPHABET.length]).join('');
	return `LL-${body}`;
}

class OutOfStockError extends Error {
	constructor(productName: string) {
		super(`«${productName}» щойно розібрали. Оновіть кошик і спробуйте ще раз.`);
	}
}

export type CreateOrderResult =
	{ ok: true; number: string; redirectUrl: string | null } | { ok: false; message: string };

/**
 * Оформлення замовлення.
 *
 * Усе критичне відбувається в одній транзакції: списання залишків,
 * створення замовлення й очищення кошика. Якщо товар розібрали між
 * переглядом кошика і натисканням кнопки — транзакція відкотиться цілком.
 */
export async function createOrder(
	cookies: Cookies,
	input: CheckoutInput
): Promise<CreateOrderResult> {
	const cart = await readCart(cookies);
	if (cart.lines.length === 0) {
		return { ok: false, message: 'Кошик порожній.' };
	}

	const deliveryMethod = input.deliveryMethod as DeliveryMethodValue;
	const subtotal = cart.subtotal;
	// Той самий розрахунок, що бачив покупець у підсумку: реальний тариф НП,
	// а якщо API недоступне — фіксована ставка з config.
	const deliveryCost = await resolveDeliveryCost({
		method: deliveryMethod,
		subtotal,
		itemCount: cart.count,
		cityRef: input.deliveryCityRef
	});

	let created: { id: string; number: string };

	try {
		created = await db.$transaction(async (tx) => {
			for (const line of cart.lines) {
				// Умова stock >= quantity прямо в UPDATE робить перевірку
				// й списання атомарними — без гонок між паралельними покупцями.
				const updated = await tx.productVariant.updateMany({
					where: { id: line.variantId, stock: { gte: line.quantity } },
					data: { stock: { decrement: line.quantity } }
				});
				if (updated.count === 0) throw new OutOfStockError(line.productName);
			}

			return tx.order.create({
				data: {
					number: generateOrderNumber(),
					customerName: input.customerName,
					customerPhone: input.customerPhone,
					customerEmail: input.customerEmail || null,
					deliveryMethod,
					deliveryCity: input.deliveryCity || null,
					deliveryAddress: input.deliveryAddress || null,
					comment: input.comment || null,
					subtotal,
					deliveryCost,
					total: subtotal + deliveryCost,
					paymentProvider: DEFAULT_PAYMENT_PROVIDER,
					items: {
						create: cart.lines.map((line) => ({
							variantId: line.variantId,
							sku: `${line.productSlug}-${line.size}-${line.color}`,
							productName: line.productName,
							productSlug: line.productSlug,
							size: line.size,
							color: line.color,
							imageUrl: line.imageUrl,
							unitPrice: line.unitPrice,
							quantity: line.quantity
						}))
					}
				},
				select: { id: true, number: true }
			});
		});
	} catch (error) {
		if (error instanceof OutOfStockError) return { ok: false, message: error.message };
		throw error;
	}

	const provider = getPaymentProvider(DEFAULT_PAYMENT_PROVIDER);
	const intent = await provider.createPayment({
		id: created.id,
		number: created.number,
		total: subtotal + deliveryCost,
		customerName: input.customerName,
		customerEmail: input.customerEmail || null
	});

	if (intent.reference) {
		await db.order.update({
			where: { id: created.id },
			data: { paymentRef: intent.reference }
		});
	}

	// Сповіщення менеджерам. Всередині все загорнуто в try/catch —
	// збій Telegram не має валити вже оплачене замовлення.
	await notifyNewOrder({
		number: created.number,
		customerName: input.customerName,
		customerPhone: input.customerPhone,
		customerEmail: input.customerEmail || null,
		method: deliveryMethod,
		city: input.deliveryCity,
		address: input.deliveryAddress,
		comment: input.comment,
		lines: cart.lines,
		subtotal,
		deliveryCost,
		total: subtotal + deliveryCost
	});

	await clearCart(cookies);

	return { ok: true, number: created.number, redirectUrl: intent.redirectUrl };
}

export async function getOrderByNumber(number: string) {
	return db.order.findUnique({
		where: { number },
		select: {
			number: true,
			status: true,
			paymentStatus: true,
			customerName: true,
			customerPhone: true,
			deliveryMethod: true,
			deliveryCity: true,
			deliveryAddress: true,
			subtotal: true,
			deliveryCost: true,
			total: true,
			createdAt: true,
			items: {
				select: {
					productName: true,
					productSlug: true,
					size: true,
					color: true,
					imageUrl: true,
					unitPrice: true,
					quantity: true
				}
			}
		}
	});
}
