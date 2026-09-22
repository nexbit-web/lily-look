import { env } from '$env/dynamic/private';
import { buildOrderMessage, type OrderMessage } from '$lib/order-message';
import { callTelegram, isTelegramConfigured } from './bot/api.js';

/**
 * Сповіщення в робочу групу менеджерів.
 *
 * Це найстарша частина інтеграції й свідомо найтупіша: один текст в один
 * чат, без кнопок і без бази. Вона лишається як загальна стрічка «що
 * замовили» — її бачать усі в групі, зокрема ті, кому доступ до бота не
 * видавали. Управління замовленням живе окремо (`./bot`), і від цієї
 * функції не залежить.
 *
 * Best-effort за задумом: якщо бот не налаштований або Telegram лежить,
 * замовлення все одно створюється й лежить у базі. Втратити продаж через
 * чужий API гірше, ніж не отримати повідомлення.
 *
 * Перевірити налаштування, не роблячи замовлення: `npm run telegram:check`.
 */

export type OrderNotification = OrderMessage;

export { isTelegramConfigured };

/**
 * Надіслати текст у робочу групу. Повертає, чи вийшло, але не кидає
 * винятків: жоден виклик не має валити те, що його викликало.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
	if (!isTelegramConfigured()) return false;

	const outcome = await callTelegram('sendMessage', {
		chat_id: env.TELEGRAM_CHAT_ID ?? '',
		text,
		parse_mode: 'HTML',
		link_preview_options: { is_disabled: true }
	});

	return outcome.ok;
}

export async function notifyNewOrder(order: OrderNotification): Promise<boolean> {
	if (!isTelegramConfigured()) return false;

	try {
		return await sendTelegramMessage(buildOrderMessage(order));
	} catch (cause) {
		// Сюда потрапити не мусимо — але якщо складання тексту колись
		// зламається, замовлення все одно має пройти.
		console.error('[telegram] не вдалося скласти повідомлення', cause);
		return false;
	}
}
