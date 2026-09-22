import {
	canMove,
	keyboardFor,
	statusLabel,
	type BotRoleValue,
	type OrderStatusValue
} from '$lib/bot-workflow';
import { buildOrderMessage, type OrderMessage } from '$lib/order-message';
import type { DeliveryMethodValue } from '$lib/config';
import { db } from '../db.js';
import { getPaymentProvider } from '../payments.js';
import type { Actor } from './access.js';
import { activeRecipients } from './access.js';
import { editMessage, sendMessage } from './api.js';

/**
 * Замовлення очима менеджера: картка в Telegram і зміна її стану.
 *
 * Два правила, заради яких усе тут і написано.
 *
 * Перше: статус не змінюється «наосліп». Кнопку могли натиснути зі старого
 * повідомлення, де стан був іншим, або двоє одночасно — тож перехід
 * застосовується умовним `updateMany`, як і списання залишків у кошику.
 * Виграє один, другий отримає чесну відмову, а не мовчазне перетирання.
 *
 * Друге: одне замовлення лежить у кількох чатах. Перемкнув статус один —
 * решта не має лишитись із кнопками від стану, якого вже немає, тож після
 * зміни всі копії переписуються.
 */

const ORDER_CARD = {
	id: true,
	number: true,
	status: true,
	customerName: true,
	customerPhone: true,
	customerEmail: true,
	deliveryMethod: true,
	deliveryCity: true,
	deliveryAddress: true,
	comment: true,
	subtotal: true,
	deliveryCost: true,
	total: true,
	paymentProvider: true,
	createdAt: true,
	items: {
		select: {
			variantId: true,
			sku: true,
			productName: true,
			productSlug: true,
			size: true,
			color: true,
			imageUrl: true,
			unitPrice: true,
			quantity: true
		}
	},
	events: {
		select: { status: true, createdAt: true, actor: { select: { name: true } } },
		orderBy: { createdAt: 'desc' },
		take: 1
	}
} as const;

type OrderCard = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

async function loadOrder(number: string) {
	return db.order.findUnique({ where: { number }, select: ORDER_CARD });
}

/** «Відправлене · Олена, 17 вересня 15:42» — або просто назва стану. */
function statusLine(order: OrderCard): string {
	const label = statusLabel(order.status as OrderStatusValue);
	const last = order.events[0];
	if (!last || last.status !== order.status) return `Статус: ${label}`;

	const when = new Intl.DateTimeFormat('uk-UA', {
		timeZone: 'Europe/Kyiv',
		day: 'numeric',
		month: 'long',
		hour: '2-digit',
		minute: '2-digit'
	}).format(last.createdAt);

	const who = last.actor?.name;
	return `Статус: ${label} · ${who ? `${who}, ` : ''}${when}`;
}

function toMessage(order: OrderCard, origin: string | null): OrderMessage {
	return {
		number: order.number,
		customerName: order.customerName,
		customerPhone: order.customerPhone,
		customerEmail: order.customerEmail,
		method: order.deliveryMethod as DeliveryMethodValue,
		city: order.deliveryCity ?? '',
		address: order.deliveryAddress ?? '',
		comment: order.comment ?? '',
		lines: order.items.map((item, index) => ({
			id: `${order.number}-${index}`,
			variantId: item.variantId ?? '',
			productName: item.productName,
			productSlug: item.productSlug,
			size: item.size,
			color: item.color,
			imageUrl: item.imageUrl,
			unitPrice: item.unitPrice,
			quantity: item.quantity,
			lineTotal: item.unitPrice * item.quantity,
			stock: 0
		})),
		subtotal: order.subtotal,
		deliveryCost: order.deliveryCost,
		total: order.total,
		payment: getPaymentProvider(order.paymentProvider).label,
		orderUrl: origin ? `${origin}/order/${order.number}` : null,
		status: statusLine(order),
		// Час замовлення, а не «зараз»: картку перемальовують і через добу.
		now: order.createdAt
	};
}

/**
 * Розіслати нове замовлення всім, у кого є доступ.
 *
 * Кожному — свої кнопки: кур'єр не має бачити «Скасувати». Ідентифікатори
 * надісланих повідомлень запамʼятовуємо, щоб потім переписати всі копії.
 */
export async function dispatchOrder(number: string, origin: string | null): Promise<number> {
	const order = await loadOrder(number);
	if (!order) return 0;

	const recipients = await activeRecipients();
	if (recipients.length === 0) return 0;

	const text = buildOrderMessage(toMessage(order, origin));
	let sent = 0;

	for (const recipient of recipients) {
		const keyboard = keyboardFor(
			order.number,
			order.status as OrderStatusValue,
			recipient.role as BotRoleValue
		);
		const outcome = await sendMessage(recipient.chatId, text, keyboard);
		if (!outcome.ok) continue;

		sent += 1;
		await db.botNotice.upsert({
			where: { orderId_chatId: { orderId: order.id, chatId: recipient.chatId } },
			create: {
				orderId: order.id,
				botUserId: recipient.id,
				chatId: recipient.chatId,
				messageId: BigInt(outcome.result.message_id)
			},
			update: { messageId: BigInt(outcome.result.message_id) }
		});
	}

	return sent;
}

/**
 * Перемалювати всі копії картки під новий стан.
 *
 * Помилки навмисно ковтаємо поштучно: менеджер міг видалити повідомлення
 * в себе, і це не привід валити зміну статусу, яка вже в базі.
 */
async function refreshNotices(orderId: string, origin: string | null): Promise<void> {
	const order = await db.order.findUnique({ where: { id: orderId }, select: ORDER_CARD });
	if (!order) return;

	const notices = await db.botNotice.findMany({
		where: { orderId },
		select: { chatId: true, messageId: true, botUser: { select: { role: true } } }
	});

	const text = buildOrderMessage(toMessage(order, origin));

	for (const notice of notices) {
		const keyboard = keyboardFor(
			order.number,
			order.status as OrderStatusValue,
			(notice.botUser?.role ?? 'MANAGER') as BotRoleValue
		);
		await editMessage(notice.chatId, notice.messageId, text, keyboard);
	}
}

export type Applied =
	| { ok: true; status: OrderStatusValue }
	/** Стан уже інший: хтось устиг раніше або кнопка зі старого повідомлення. */
	| { ok: false; why: 'missing' | 'forbidden' | 'stale'; status?: OrderStatusValue };

/**
 * Перевести замовлення в новий стан від імені менеджера.
 *
 * Скасування навмисно не повертає товар на склад: каталогом володіє CRM,
 * і рішення про залишки має бути її. У журналі подія лишається, тож у CRM
 * видно, що сталось, і вона може повернути залишок сама.
 */
export async function applyStatus(
	number: string,
	to: OrderStatusValue,
	actor: Actor,
	origin: string | null
): Promise<Applied> {
	const order = await db.order.findUnique({
		where: { number },
		select: { id: true, status: true }
	});
	if (!order) return { ok: false, why: 'missing' };

	const from = order.status as OrderStatusValue;
	if (!canMove(from, to, actor.role)) {
		return { ok: false, why: from === to ? 'stale' : 'forbidden', status: from };
	}

	// Умова `status: from` — те саме, що й у списанні залишків: якщо стан
	// устиг змінитись між читанням і записом, нічого не оновиться.
	const moved = await db.order.updateMany({
		where: { id: order.id, status: from },
		data: { status: to }
	});
	if (moved.count === 0) {
		const fresh = await db.order.findUnique({
			where: { id: order.id },
			select: { status: true }
		});
		return { ok: false, why: 'stale', status: fresh?.status as OrderStatusValue };
	}

	await db.orderEvent.create({
		data: { orderId: order.id, status: to, actorId: actor.id }
	});

	await refreshNotices(order.id, origin);

	return { ok: true, status: to };
}

/** Активні замовлення для команди «що в роботі». */
export async function activeOrders(limit = 10) {
	return db.order.findMany({
		where: { status: { in: ['NEW', 'CONFIRMED', 'SHIPPED'] } },
		select: { number: true, status: true, customerName: true, total: true, createdAt: true },
		orderBy: { createdAt: 'desc' },
		take: limit
	});
}

/** Картка одного замовлення на вимогу — для пошуку за номером. */
export async function orderCard(
	number: string,
	role: BotRoleValue,
	origin: string | null
): Promise<{ text: string; keyboard: ReturnType<typeof keyboardFor> } | null> {
	const order = await loadOrder(number);
	if (!order) return null;

	return {
		text: buildOrderMessage(toMessage(order, origin)),
		keyboard: keyboardFor(order.number, order.status as OrderStatusValue, role)
	};
}

/** Запамʼятати повідомлення, надіслане на вимогу, — щоб і його оновлювати. */
export async function rememberNotice(
	number: string,
	actor: Actor,
	messageId: number
): Promise<void> {
	const order = await db.order.findUnique({ where: { number }, select: { id: true } });
	if (!order) return;

	await db.botNotice.upsert({
		where: { orderId_chatId: { orderId: order.id, chatId: actor.chatId } },
		create: {
			orderId: order.id,
			botUserId: actor.id,
			chatId: actor.chatId,
			messageId: BigInt(messageId)
		},
		update: { messageId: BigInt(messageId), botUserId: actor.id }
	});
}
