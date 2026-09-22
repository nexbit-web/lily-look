import { deliveryMethod, SITE, type DeliveryMethodValue } from '$lib/config';
import { formatPrice } from '$lib/money';
import type { CartLine } from '$lib/types';

/**
 * Повідомлення про замовлення для робочої групи в Telegram.
 *
 * Це не вітальна листівка, а наряд на збірку: менеджер читає його з
 * телефона, поки шукає речі на полиці, і йому потрібні назва, колір,
 * розмір, кількість — без жодної оздоби. Тому тут немає ні емодзі, ні
 * рамок: рівно текст, розбитий на розділи, у тому порядку, в якому
 * замовлення обробляють — хто, куди, що, скільки.
 *
 * Модуль свідомо чистий: ні мережі, ні змінних середовища. Формат
 * перевіряється тестами напряму, а `$lib/server/telegram` лише надсилає
 * готовий рядок.
 */

/** Стеля Telegram на одне повідомлення. */
export const MESSAGE_LIMIT = 4096;

/** Скільки лишаємо на хвіст повідомлення, коли ріжемо список позицій. */
const TRIM_RESERVE = 200;

export type OrderMessage = {
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
	/** Як платять: «Оплата при отриманні» чи назва провайдера. */
	payment: string;
	/** Посилання на замовлення на сайті. Немає — рядка не буде. */
	orderUrl?: string | null;
	/**
	 * Стан замовлення рядком: «Відправлене · Олена, 17 вересня 15:42».
	 * Його показує бот менеджерам; у першому сповіщенні його немає.
	 */
	status?: string | null;
	/** Час замовлення; передається окремо, щоб формат можна було перевірити. */
	now?: Date;
};

/**
 * Telegram у режимі HTML ламається на сирих `<`, `>`, `&`, а в значенні
 * атрибута — ще й на лапках. Екрануємо все четверо: у коментарі покупця
 * може бути будь-що.
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** «17 вересня, 15:42» за київським часом — менеджер живе в ньому. */
function formatMoment(now: Date): string {
	return new Intl.DateTimeFormat('uk-UA', {
		timeZone: 'Europe/Kyiv',
		day: 'numeric',
		month: 'long',
		hour: '2-digit',
		minute: '2-digit'
	}).format(now);
}

/**
 * Позиція замовлення двома рядками: назва окремо, ознаки окремо.
 * Кількість пишемо завжди, навіть коли вона одна: зібрати не ту
 * кількість — дорожче, ніж прочитати зайве слово.
 */
function formatLine(line: CartLine, position: number): string {
	const marks = [
		escapeHtml(line.color),
		escapeHtml(line.size),
		`${line.quantity} шт`,
		formatPrice(line.lineTotal)
	];

	return `${position}. ${escapeHtml(line.productName)}\n   ${marks.join(' · ')}`;
}

function section(title: string, body: (string | null)[]): string[] {
	const rows = body.filter((row): row is string => row !== null && row !== '');
	if (rows.length === 0) return [];
	return ['', `<b>${title}</b>`, ...rows];
}

export function buildOrderMessage(order: OrderMessage): string {
	const delivery = deliveryMethod(order.method);
	const destination = [order.city, order.address].filter(Boolean).map(escapeHtml).join(', ');
	const moment = formatMoment(order.now ?? new Date());

	const head = [
		`<b>Замовлення ${escapeHtml(order.number)}</b>`,
		`${escapeHtml(SITE.name)} · ${escapeHtml(moment)}`,
		...(order.status ? [escapeHtml(order.status)] : [])
	];

	const body = [
		...section('Покупець', [
			escapeHtml(order.customerName),
			// Номер посиланням: менеджер набирає його одним дотиком.
			`<a href="tel:${escapeHtml(order.customerPhone)}">${escapeHtml(order.customerPhone)}</a>`,
			order.customerEmail ? escapeHtml(order.customerEmail) : null
		]),
		...section('Доставка', [escapeHtml(delivery.label), destination || null]),
		...section('Коментар покупця', [order.comment ? escapeHtml(order.comment) : null])
	];

	const money = [
		'',
		`Сума: ${formatPrice(order.subtotal)}`,
		`Доставка: ${order.deliveryCost === 0 ? 'безкоштовно' : formatPrice(order.deliveryCost)}`,
		`<b>Разом: ${formatPrice(order.total)}</b>`,
		'',
		escapeHtml(order.payment),
		...(order.orderUrl ? ['', escapeHtml(order.orderUrl)] : [])
	];

	const items = order.lines.map((line, index) => formatLine(line, index + 1));

	// Довге замовлення не має перетворитись на відмову Telegram: у такому
	// разі ріжемо список позицій, а не повідомлення посередині. Усі позиції
	// лишаються в замовленні на сайті — і посилання на нього нижче.
	const fixed = [...head, ...body, '', '<b>Товари</b>', ...money].join('\n').length;
	const room = MESSAGE_LIMIT - fixed - TRIM_RESERVE;

	const kept: string[] = [];
	let used = 0;
	for (const item of items) {
		if (used + item.length + 1 > room) break;
		kept.push(item);
		used += item.length + 1;
	}

	const hidden = items.length - kept.length;
	const itemRows =
		hidden > 0 ? [...kept, `…та ще ${hidden} ${hidden === 1 ? 'позиція' : 'позицій'}`] : kept;

	return [...head, ...body, '', '<b>Товари</b>', ...itemRows, ...money].join('\n');
}
