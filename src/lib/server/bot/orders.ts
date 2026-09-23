import {
	canMove,
	canRoleEver,
	keyboardFor,
	statusLabel,
	type BotRoleValue,
	type OrderStatusValue
} from '$lib/bot/workflow';
import { buildOrderMessage, type OrderMessage } from '$lib/bot/order-message';
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

/**
 * Хто востаннє чіпав замовлення: «Олена · 18 вересня 10:12».
 *
 * Порожньо, поки стан ніхто не міняв, — у новому замовленні цей рядок
 * тільки заважав би. Подія без автора означає, що статус змінила CRM.
 */
function changedBy(order: OrderCard): string | null {
	const last = order.events[0];
	if (!last || last.status !== order.status) return null;

	const when = new Intl.DateTimeFormat('uk-UA', {
		timeZone: 'Europe/Kyiv',
		day: 'numeric',
		month: 'long',
		hour: '2-digit',
		minute: '2-digit'
	}).format(last.createdAt);

	return `${last.actor?.name ?? 'CRM'} · ${when}`;
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
		status: statusLabel(order.status as OrderStatusValue),
		changedBy: changedBy(order),
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
 * Перемалювати всі копії картки під переданий стан.
 *
 * Картку приймаємо готовою, а не читаємо ще раз: після вдалого переходу
 * новий стан і так відомий, а зайвий запит до бази тут робився б на
 * кожне натискання.
 *
 * Помилки навмисно ковтаємо поштучно: менеджер міг видалити повідомлення
 * в себе, і це не привід валити зміну статусу, яка вже в базі.
 */
async function refreshNotices(order: OrderCard, origin: string | null): Promise<void> {
	const notices = await db.botNotice.findMany({
		where: { orderId: order.id },
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
 * Скасування повертає товар на склад: залишки списуються в мить
 * оформлення, і якщо їх не повернути, скасоване замовлення тихо зʼїдало б
 * склад. Повернення йде в тій самій транзакції, що й зміна статусу, —
 * інакше між ними можна було б впасти й лишити склад розбалансованим.
 *
 * Позиції без `variantId` пропускаються: варіант могли видалити в CRM
 * після замовлення, а знімок у `OrderItem` лишився. Повертати нічого.
 *
 * Окремий випадок — статус змінили повз бота, в CRM. Тоді кнопка під
 * повідомленням показує стан, якого вже немає, і натискання по ній не
 * має просто відмовляти: картка перемальовується під справжній стан, і
 * менеджер одразу бачить актуальні кнопки. Синхронізація ліниво, у мить
 * натискання: опитувати базу на випадок, що CRM щось змінила, довелось би
 * постійно й задарма.
 */
export async function applyStatus(
	number: string,
	to: OrderStatusValue,
	actor: Actor,
	origin: string | null
): Promise<Applied> {
	// Одне читання на весь виклик: тут і залишки для повернення, і все,
	// з чого потім складається перемальована картка.
	const order = await loadOrder(number);
	if (!order) return { ok: false, why: 'missing' };

	const from = order.status as OrderStatusValue;

	if (!canMove(from, to, actor.role)) {
		// Такого цій ролі не можна ніколи — отже, кнопка не наша.
		if (!canRoleEver(to, actor.role)) return { ok: false, why: 'forbidden', status: from };

		// Кнопка справжня, просто стан уже інший: доганяємо CRM.
		await refreshNotices(order, origin);
		return { ok: false, why: 'stale', status: from };
	}

	const returning =
		to === 'CANCELLED'
			? order.items.filter((item): item is (typeof order.items)[number] & { variantId: string } =>
					Boolean(item.variantId)
				)
			: [];

	const moved = await db.$transaction(async (tx) => {
		// Умова `status: from` — те саме, що й у списанні залишків: якщо стан
		// устиг змінитись між читанням і записом, нічого не оновиться, і вся
		// транзакція лишиться порожньою.
		const changed = await tx.order.updateMany({
			where: { id: order.id, status: from },
			data: { status: to }
		});
		if (changed.count === 0) return false;

		await tx.orderEvent.create({
			data: { orderId: order.id, status: to, actorId: actor.id }
		});

		for (const item of returning) {
			// `updateMany`, а не `update`: варіант міг зникнути з каталогу, і
			// це не привід валити скасування замовлення.
			await tx.productVariant.updateMany({
				where: { id: item.variantId },
				data: { stock: { increment: item.quantity } }
			});
		}

		return true;
	});

	if (!moved) {
		// Хтось устиг раніше. Стан читаємо заново — саме його треба показати.
		const fresh = await loadOrder(number);
		if (fresh) await refreshNotices(fresh, origin);
		return { ok: false, why: 'stale', status: fresh?.status as OrderStatusValue };
	}

	// Новий стан уже відомий, тож картку складаємо з того, що прочитали,
	// а не ходимо в базу вдруге.
	await refreshNotices(
		{
			...order,
			status: to,
			events: [{ status: to, createdAt: new Date(), actor: { name: actor.name } }]
		},
		origin
	);

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
