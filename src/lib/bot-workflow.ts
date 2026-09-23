import { ORDER_STATUS_LABELS } from '$lib/config';

/**
 * Правила руху замовлення й того, кому що можна натискати.
 *
 * Модуль чистий: ні бази, ні мережі. Кнопки під повідомленням і перевірка
 * на боці сервера рахуються з однієї таблиці — інакше рано чи пізно
 * зʼявилась би кнопка, яку сервер не приймає, або навпаки.
 */

export type OrderStatusValue = keyof typeof ORDER_STATUS_LABELS;

/** Що людині дозволено робити. */
export type BotRoleValue = 'ADMIN' | 'MANAGER' | 'COURIER';

/** Хто веде замовлення. Адмін уміє все те саме плюс звіти й доступи. */
const KEEPERS: BotRoleValue[] = ['ADMIN', 'MANAGER'];

export type Action = {
	/** Куди переводимо. */
	to: OrderStatusValue;
	/** Напис на кнопці. */
	label: string;
	/** Кому доступно. */
	roles: BotRoleValue[];
};

/**
 * Скасування — єдина дія, яку не відмотати, тож воно має читатись інакше,
 * ніж решта. Кольору кнопок Telegram не дає взагалі, тому лишається знак
 * у написі й окремий рядок.
 */
const CANCEL = '✕ Скасувати';

/**
 * Дозволені переходи. Кур'єр бачить тільки останній крок: його справа —
 * довезти й відзначити, а не скасовувати чужі замовлення.
 */
const FLOW: Record<OrderStatusValue, Action[]> = {
	NEW: [
		{ to: 'CONFIRMED', label: 'Прийняти', roles: KEEPERS },
		{ to: 'CANCELLED', label: CANCEL, roles: KEEPERS }
	],
	CONFIRMED: [
		{ to: 'SHIPPED', label: 'Відправлено', roles: KEEPERS },
		{ to: 'CANCELLED', label: CANCEL, roles: KEEPERS }
	],
	SHIPPED: [
		{ to: 'DELIVERED', label: 'Отримано', roles: ['ADMIN', 'MANAGER', 'COURIER'] },
		{ to: 'CANCELLED', label: CANCEL, roles: KEEPERS }
	],
	// Далі рухати нікуди: замовлення закрите.
	DELIVERED: [],
	CANCELLED: []
};

export function statusLabel(status: OrderStatusValue): string {
	return ORDER_STATUS_LABELS[status];
}

/** Чи має роль право на звіти й видачу доступів. */
export function isAdmin(role: BotRoleValue): boolean {
	return role === 'ADMIN';
}

/** Що ця людина може зробити із замовленням у цьому стані. */
export function actionsFor(status: OrderStatusValue, role: BotRoleValue): Action[] {
	return FLOW[status].filter((action) => action.roles.includes(role));
}

/**
 * Чи можна цей перехід. Єдина перевірка на боці сервера: кнопка могла
 * прийти зі старого повідомлення, де стан був іншим, або від людини,
 * якій роль змінили вже після того, як кнопку намалювали.
 */
export function canMove(from: OrderStatusValue, to: OrderStatusValue, role: BotRoleValue): boolean {
	return actionsFor(from, role).some((action) => action.to === to);
}

/**
 * Дані кнопки. Влазити треба в 64 байти, тому номер замовлення, а не id:
 * він і коротший, і читається в логах очима.
 */
export function encodeAction(number: string, to: OrderStatusValue): string {
	return `o:${number}:${to}`;
}

export function decodeAction(data: string): { number: string; to: OrderStatusValue } | null {
	const parts = data.split(':');
	if (parts.length !== 3 || parts[0] !== 'o') return null;

	const [, number, to] = parts;
	if (!number || !(to in ORDER_STATUS_LABELS)) return null;

	return { number, to: to as OrderStatusValue };
}

/**
 * Кнопки стовпчиком, по одній у рядку.
 *
 * У рядок вони стають вузькими, і на телефоні «Відправлено» та
 * «Скасувати» опиняються за пів сантиметра одна від одної — а ціна
 * промаху різна. Стовпчик ширший і промахнутись важче.
 */
export function keyboardFor(
	number: string,
	status: OrderStatusValue,
	role: BotRoleValue
): { text: string; callback_data: string }[][] {
	return actionsFor(status, role).map((action) => [
		{ text: action.label, callback_data: encodeAction(number, action.to) }
	]);
}
