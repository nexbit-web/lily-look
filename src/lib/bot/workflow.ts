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

/**
 * Чи закрите замовлення остаточно.
 *
 * Закрите — це те, з яким більше нічого не роблять: отримане або
 * скасоване. Відправлене сюди не входить, хоч роботи в магазині по ньому
 * вже й немає: доставку ще треба відзначити, і кнопка для цього має
 * лишитись під повідомленням.
 *
 * Рахується з `FLOW`, а не окремим списком: стан без жодної дії і є той,
 * далі якого не рухаються. Інакше два списки рано чи пізно розійшлись би.
 */
export function closesOrder(status: OrderStatusValue): boolean {
	return FLOW[status].length === 0;
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
 * Чи може ця роль узагалі колись зробити такий перехід — хоч із якогось
 * стану.
 *
 * Потрібно, щоб відрізнити дві різні відмови, які інакше виглядають
 * однаково. Менеджер тисне «Прийняти», а замовлення вже відправлене:
 * з цього стану так не можна, але кнопка була справжня — просто картка
 * застаріла, і її треба оновити. А кур'єр, у якого «Скасувати» не було
 * ніколи, тисне його підробленими даними — ось це справжня відмова.
 */
export function canRoleEver(to: OrderStatusValue, role: BotRoleValue): boolean {
	return Object.values(FLOW).some((actions) =>
		actions.some((action) => action.to === to && action.roles.includes(role))
	);
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

/**
 * Підказки команд для меню Telegram.
 *
 * Той самий список, що відкривається кнопкою біля поля вводу: людині не
 * треба ні памʼятати команди, ні знати, як вони пишуться. Список залежить
 * від ролі — менеджер не бачить того, чого не може, і навіть не дізнається,
 * що воно існує.
 */
export type BotCommandHint = { command: string; description: string };

const KEEPER_COMMANDS: BotCommandHint[] = [
	{ command: 'zamovlennia', description: 'Активні замовлення' },
	{ command: 'z', description: 'Знайти замовлення за номером' },
	{ command: 'dopomoha', description: 'Що вміє бот' },
	{ command: 'vyity', description: 'Вийти з бота' }
];

const COURIER_COMMANDS: BotCommandHint[] = [
	{ command: 'zamovlennia', description: 'Замовлення в дорозі' },
	{ command: 'z', description: 'Знайти замовлення за номером' },
	{ command: 'dopomoha', description: 'Що вміє бот' },
	{ command: 'vyity', description: 'Вийти з бота' }
];

const ADMIN_COMMANDS: BotCommandHint[] = [
	{ command: 'zamovlennia', description: 'Активні замовлення' },
	{ command: 'z', description: 'Знайти замовлення за номером' },
	{ command: 'zvit', description: 'Звіт: замовлення й виторг' },
	{ command: 'dostup', description: 'Хто має доступ' },
	{ command: 'kod', description: 'Видати код доступу' },
	{ command: 'dopomoha', description: 'Що вміє бот' },
	{ command: 'vyity', description: 'Вийти з бота' }
];

export function commandsFor(role: BotRoleValue): BotCommandHint[] {
	if (role === 'ADMIN') return ADMIN_COMMANDS;
	if (role === 'COURIER') return COURIER_COMMANDS;
	return KEEPER_COMMANDS;
}
