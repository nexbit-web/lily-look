import { env } from '$env/dynamic/private';
import { deliveryMethod, SITE, type DeliveryMethodValue } from '$lib/config';
import { formatPrice } from '$lib/money';
import type { CartLine } from '$lib/types';

/**
 * Сповіщення менеджерам у робочу групу Telegram.
 *
 * Навмисно best-effort: якщо бот не налаштований або Telegram лежить,
 * замовлення все одно створюється. Втратити продаж через чужий API —
 * гірше, ніж не отримати повідомлення.
 *
 * Налаштування:
 *  1. @BotFather → /newbot → TELEGRAM_BOT_TOKEN
 *  2. Додати бота в групу (адміном, щоб міг писати)
 *  3. TELEGRAM_CHAT_ID — id групи, зазвичай з мінусом: -1001234567890
 */

const TIMEOUT_MS = 5000;

export type OrderNotification = {
	number: string;
	customerName: string;
	customerPhone: string;
	customerEmail: string | null;
	method: DeliveryMethodValue;
	city: string;
	address: string;
	comment: string;
	lines: CartLine[];
	subtotal: number;
	deliveryCost: number;
	total: number;
};

export function isTelegramConfigured(): boolean {
	return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

/** Telegram HTML-режим ламається на сирих <, > і & у даних покупця. */
function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildMessage(order: OrderNotification): string {
	const delivery = deliveryMethod(order.method);

	const items = order.lines
		.map(
			(line) =>
				`• ${escapeHtml(line.productName)}\n` +
				`   ${escapeHtml(line.color)} / ${escapeHtml(line.size)} × ${line.quantity} — <b>${formatPrice(line.lineTotal)}</b>`
		)
		.join('\n');

	const destination = [order.city, order.address].filter(Boolean).map(escapeHtml).join(', ');

	const rows = [
		`🛍 <b>Нове замовлення ${escapeHtml(order.number)}</b>`,
		'',
		`👤 ${escapeHtml(order.customerName)}`,
		`📞 <a href="tel:${escapeHtml(order.customerPhone)}">${escapeHtml(order.customerPhone)}</a>`,
		order.customerEmail ? `✉️ ${escapeHtml(order.customerEmail)}` : null,
		'',
		`🚚 <b>${escapeHtml(delivery.label)}</b>`,
		destination ? `📍 ${destination}` : null,
		'',
		'<b>Товари</b>',
		items,
		'',
		`Сума: ${formatPrice(order.subtotal)}`,
		`Доставка: ${order.deliveryCost === 0 ? 'безкоштовно' : formatPrice(order.deliveryCost)}`,
		`<b>Разом: ${formatPrice(order.total)}</b>`,
		order.comment ? `\n💬 ${escapeHtml(order.comment)}` : null,
		'',
		`<i>${SITE.name} · оплата при отриманні</i>`
	];

	return rows.filter((row) => row !== null).join('\n');
}

export async function notifyNewOrder(order: OrderNotification): Promise<void> {
	if (!isTelegramConfigured()) return;

	try {
		const response = await fetch(
			`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					chat_id: env.TELEGRAM_CHAT_ID,
					text: buildMessage(order),
					parse_mode: 'HTML',
					link_preview_options: { is_disabled: true }
				}),
				signal: AbortSignal.timeout(TIMEOUT_MS)
			}
		);

		if (!response.ok) {
			const body = await response.text();
			console.error(`[telegram] ${response.status}: ${body}`);
		}
	} catch (cause) {
		console.error('[telegram] не вдалося надіслати повідомлення', cause);
	}
}
