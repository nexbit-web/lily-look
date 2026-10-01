import type { Cookies } from '@sveltejs/kit';
import type { DeliveryMethodValue } from '$lib/config';
import type { CheckoutInput, QuickOrderInput } from '$lib/schemas';
import type { CartLine } from '$lib/types';
import { clearCart, lineForVariant, readCart } from './cart.js';
import type { Prisma } from '../../../prisma/generated/client.js';
import { db } from './db.js';
import { prizeDiscount } from '$lib/wheel';
import { DEFAULT_PAYMENT_PROVIDER, getPaymentProvider } from './payments.js';
import { dispatchOrder } from './bot/orders.js';
import { PRIZE_COOKIE, claimPrize, forgetPrize } from './wheel.js';

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

/**
 * На цей номер подарунок колеса вже брали. Куки можна почистити й
 * покрутити знову — а номер телефону в замовленні справжній: на нього
 * дзвонить менеджер і приходить посилка.
 */
class PrizeTakenError extends Error {
	constructor() {
		super(
			'Подарунок із колеса діє один раз на номер телефону — його вже використано. Натисніть ще раз, і ми оформимо замовлення без знижки.'
		);
	}
}

export type CreateOrderResult =
	| {
			ok: true;
			number: string;
			redirectUrl: string | null;
			/** Що купили — для реклами (подія Purchase), без особистого. */
			items: { slug: string; name: string; unitPrice: number; quantity: number }[];
			/** Приз колеса, що пішов у замовлення: «Знижка 7%», «Безкоштовна доставка». */
			prize: string | null;
	  }
	| {
			ok: false;
			message: string;
			/** Приз відхилено (на номер уже брали) — куку приза треба прибрати. */
			prizeTaken?: true;
	  };

/**
 * Оформлення замовлення з кошика.
 *
 * Кошик чиститься лише тоді, коли замовлення вже в базі: не вийшло
 * (товар розібрали) — покупець повертається до того самого кошика.
 */
export async function createOrder(
	cookies: Cookies,
	input: CheckoutInput,
	/** Адреса сайту — з неї збирається посилання на замовлення для менеджера. */
	origin?: string
): Promise<CreateOrderResult> {
	const cart = await readCart(cookies);
	if (cart.lines.length === 0) {
		return { ok: false, message: 'Кошик порожній.' };
	}

	const result = await placeOrder(cart.lines, input, origin, cookies.get(PRIZE_COOKIE));
	if (result.ok) {
		await clearCart(cookies);
		if (result.prize) forgetPrize(cookies);
	}
	// Без куки наступне натискання оформить замовлення без знижки.
	if (!result.ok && result.prizeTaken) forgetPrize(cookies);
	return result;
}

/**
 * «Купити в 1 клік»: одна річ зі сторінки товару, від покупця — лише ім'я
 * й телефон. Місто й відділення менеджер уточнює дзвінком, тож доставка
 * записується найчастішим способом (Нова Пошта, відділення) без адреси —
 * так замовлення й видно: відділення без міста буває тільки тут.
 *
 * Кошик не чіпаємо: що лежало, те й лежить.
 */
export async function createQuickOrder(
	cookies: Cookies,
	variantId: string,
	contact: QuickOrderInput,
	origin?: string
): Promise<CreateOrderResult> {
	const line = await lineForVariant(variantId);
	if (!line) return { ok: false, message: 'Цього розміру вже немає в наявності.' };

	const result = await placeOrder(
		[line],
		{
			...contact,
			customerEmail: '',
			deliveryMethod: QUICK_ORDER_DELIVERY,
			deliveryCity: '',
			deliveryAddress: '',
			comment: ''
		},
		origin,
		cookies.get(PRIZE_COOKIE)
	);
	if ((result.ok && result.prize) || (!result.ok && result.prizeTaken)) forgetPrize(cookies);
	return result;
}

/** Спосіб доставки швидкого замовлення, поки менеджер не уточнив. */
export const QUICK_ORDER_DELIVERY: DeliveryMethodValue = 'NOVA_POSHTA_BRANCH';

/** Чи брав цей номер подарунок колеса раніше (скасовані замовлення не рахуються). */
async function phoneHadPrize(tx: Prisma.TransactionClient, phone: string): Promise<boolean> {
	const order = await tx.order.findFirst({
		where: { customerPhone: phone, prize: { not: null }, status: { not: 'CANCELLED' } },
		select: { id: true }
	});
	return order !== null;
}

/**
 * Замовлення з готових позицій.
 *
 * Усе критичне відбувається в одній транзакції: списання залишків і
 * створення замовлення. Якщо товар розібрали між переглядом і натисканням
 * кнопки — транзакція відкотиться цілком.
 */
async function placeOrder(
	lines: CartLine[],
	input: CheckoutInput,
	origin: string | undefined,
	/** Id розіграшу колеса з куки — приз забирається в тій самій транзакції. */
	spinId?: string
): Promise<CreateOrderResult> {
	const deliveryMethod = input.deliveryMethod as DeliveryMethodValue;
	const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
	// Доставку покупець платить перевізнику сам, на пошті, або її оплачує
	// магазин — у суму замовлення вона не входить ні в тому, ні в іншому разі.
	// Нуль тут — не «безкоштовно»: хто платить, видно зі способу й суми
	// (`isDeliveryFree`), а картка замовлення так і пише.
	const deliveryCost = 0;

	let created: { id: string; number: string; total: number; prize: string | null };

	try {
		created = await db.$transaction(async (tx) => {
			for (const line of lines) {
				// Умова stock >= quantity прямо в UPDATE робить перевірку
				// й списання атомарними — без гонок між паралельними покупцями.
				const updated = await tx.productVariant.updateMany({
					// isActive — щоб не продати розмір, який вимкнули в CRM
					// між переглядом кошика й натисканням «Оформити».
					where: { id: line.variantId, isActive: true, stock: { gte: line.quantity } },
					data: { stock: { decrement: line.quantity } }
				});
				if (updated.count === 0) throw new OutOfStockError(line.productName);
			}

			const number = generateOrderNumber();
			// Приз колеса — єдина знижка, яку рахує сайт, а не база: вона
			// на замовлення цілком, а не на товар (див. `prizeDiscount`).
			const prize = await claimPrize(tx, spinId, number);
			// Один подарунок на номер телефону. Відмова відкочує всю
			// транзакцію — і залишки, і позначку «приз використано».
			if (prize && (await phoneHadPrize(tx, input.customerPhone))) throw new PrizeTakenError();
			const discount = prizeDiscount(prize, subtotal);

			return tx.order.create({
				data: {
					number,
					customerName: input.customerName,
					customerPhone: input.customerPhone,
					customerEmail: input.customerEmail || null,
					deliveryMethod,
					deliveryCity: input.deliveryCity || null,
					deliveryAddress: input.deliveryAddress || null,
					comment: input.comment || null,
					subtotal,
					deliveryCost,
					total: subtotal - discount + deliveryCost,
					prize: prize?.label ?? null,
					prizeDiscount: discount,
					prizeFreeDelivery: prize?.freeDelivery ?? false,
					paymentProvider: DEFAULT_PAYMENT_PROVIDER,
					items: {
						create: lines.map((line) => ({
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
				select: { id: true, number: true, total: true, prize: true }
			});
		});
	} catch (error) {
		if (error instanceof OutOfStockError) return { ok: false, message: error.message };
		if (error instanceof PrizeTakenError) {
			return { ok: false, message: error.message, prizeTaken: true };
		}
		throw error;
	}

	const provider = getPaymentProvider(DEFAULT_PAYMENT_PROVIDER);
	const intent = await provider.createPayment({
		id: created.id,
		number: created.number,
		total: created.total,
		customerName: input.customerName,
		customerEmail: input.customerEmail || null
	});

	if (intent.reference) {
		await db.order.update({
			where: { id: created.id },
			data: { paymentRef: intent.reference }
		});
	}

	// Замовлення — персонально кожному, у кого є доступ до бота, з
	// кнопками статусів. Навмисно не чекаємо: розсилка ходить у Telegram
	// по разу на менеджера, і покупець не має дивитись на спінер, поки
	// відповідає чужий API. Помилки розсилка гасить у собі: замовлення вже
	// в базі, і втратити продаж через Telegram гірше, ніж не сповістити.
	void dispatchOrder(created.number, origin ?? null).catch((cause: unknown) => {
		console.error('[bot] розсилка менеджерам не пройшла', cause);
	});

	return {
		ok: true,
		number: created.number,
		redirectUrl: intent.redirectUrl,
		prize: created.prize,
		items: lines.map((line) => ({
			slug: line.productSlug,
			name: line.productName,
			unitPrice: line.unitPrice,
			quantity: line.quantity
		}))
	};
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
			prize: true,
			prizeDiscount: true,
			prizeFreeDelivery: true,
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
