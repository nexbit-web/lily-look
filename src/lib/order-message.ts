import { deliveryMethod, type DeliveryMethodValue } from '$lib/config';
import { formatPrice } from '$lib/money';
import { plural } from '$lib/plural';
import type { CartLine } from '$lib/types';

/**
 * Картка замовлення для менеджера в Telegram.
 *
 * Це не вітальна листівка, а наряд на збірку: менеджер читає його з
 * телефона, поки шукає речі на полиці. Тому порядок такий, у якому
 * замовлення й обробляють — що за замовлення, кому дзвонити, куди везти,
 * що покласти, скільки взяти.
 *
 * Про оформлення. Емодзі немає й не буде: у наряді вони заважають. Замість
 * них працює вага тексту — жирним лише те, що шукають очима (номер, назви
 * позицій, підсумок), решта звичайним. Номер замовлення йде в `<code>`:
 * у Telegram такий текст копіюється одним дотиком, а номер менеджер
 * копіює постійно — у накладну, в CRM, у розмову з покупцем.
 *
 * Модуль свідомо чистий: ні мережі, ні змінних середовища. Формат
 * перевіряється тестами напряму, а `$lib/server/bot` лише надсилає
 * готовий рядок.
 */

/** Стеля Telegram на одне повідомлення. */
export const MESSAGE_LIMIT = 4096;

/** Скільки лишаємо на хвіст повідомлення, коли ріжемо список позицій. */
const TRIM_RESERVE = 220;

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
	/** Стан замовлення однією назвою: «Нове», «Відправлене». */
	status?: string | null;
	/** Хто востаннє змінив стан: «Олена · 18 вересня 10:12». */
	changedBy?: string | null;
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
 * Позиція двома рядками: назва окремо й жирним, ознаки окремо й дрібно.
 *
 * Кількість пишемо завжди, навіть коли вона одна, і саме як «×2» — так
 * вона не губиться серед кольору й розміру. Зібрати не ту кількість
 * дорожче, ніж прочитати зайвий символ.
 */
function formatLine(line: CartLine, position: number): string {
	const marks = [
		escapeHtml(line.color),
		escapeHtml(line.size),
		`×${line.quantity}`,
		formatPrice(line.lineTotal)
	];

	return `${position}. <b>${escapeHtml(line.productName)}</b>\n    ${marks.join(' · ')}`;
}

/** Блок із заголовком. Порожній — його не буде взагалі. */
function block(title: string | null, body: (string | null)[]): string[] {
	const rows = body.filter((row): row is string => row !== null && row !== '');
	if (rows.length === 0) return [];

	return ['', ...(title ? [`<b>${title}</b>`] : []), ...rows];
}

export function buildOrderMessage(order: OrderMessage): string {
	const delivery = deliveryMethod(order.method);
	const destination = [order.city, order.address].filter(Boolean).map(escapeHtml).join(', ');
	const moment = formatMoment(order.now ?? new Date());

	// Перший рядок — те, за чим замовлення впізнають; другий — у якому воно
	// стані й коли прийшло. Більше в шапці нічого не потрібно.
	const head = [
		`<b>Замовлення</b> <code>${escapeHtml(order.number)}</code>`,
		[order.status ? escapeHtml(order.status) : null, escapeHtml(moment)]
			.filter(Boolean)
			.join(' · '),
		...(order.changedBy ? [`<i>${escapeHtml(order.changedBy)}</i>`] : [])
	];

	const body = [
		...block(null, [
			`<b>${escapeHtml(order.customerName)}</b>`,
			// Номер посиланням: менеджер набирає його одним дотиком.
			`<a href="tel:${escapeHtml(order.customerPhone)}">${escapeHtml(order.customerPhone)}</a>`,
			order.customerEmail ? escapeHtml(order.customerEmail) : null
		]),
		...block(null, [escapeHtml(delivery.label), destination || null]),
		...block('Коментар покупця', [order.comment ? escapeHtml(order.comment) : null])
	];

	const money = [
		'',
		`Товари · ${formatPrice(order.subtotal)}`,
		`Доставка · ${order.deliveryCost === 0 ? 'безкоштовно' : formatPrice(order.deliveryCost)}`,
		`<b>Разом · ${formatPrice(order.total)}</b>`,
		'',
		escapeHtml(order.payment),
		...(order.orderUrl ? [escapeHtml(order.orderUrl)] : [])
	];

	const items = order.lines.map((line, index) => formatLine(line, index + 1));

	// Довге замовлення не має перетворитись на відмову Telegram: у такому
	// разі ріжемо список позицій, а не повідомлення посередині. Усі позиції
	// лишаються в замовленні на сайті — і посилання на нього нижче.
	const fixed = [...head, ...body, '', '<b>Зібрати</b>', ...money].join('\n').length;
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
		hidden > 0
			? [...kept, `…та ще ${hidden} ${plural(hidden, 'позиція', 'позиції', 'позицій')}`]
			: kept;

	return [...head, ...body, '', '<b>Зібрати</b>', ...itemRows, ...money].join('\n');
}
