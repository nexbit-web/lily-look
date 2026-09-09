/** Єдине місце з бізнес-константами магазину. */

export const SITE = {
	name: 'LILY LOOK',
	tagline: 'Жіночий одяг з характером',
	description:
		'LILY LOOK — сукні, костюми, верхній одяг і базові речі для щоденного гардеробу. Доставка по всій Україні.',
	phone: '+38 (067) 000-00-00',
	email: 'hello@lilylook.ua',
	instagram: 'https://instagram.com/lilylook'
} as const;

export const CURRENCY = 'UAH';

/**
 * Звідки відправляємо посилки. Від цього міста Нова Пошта рахує тариф.
 * cityRef узятий з довідника НП (AddressGeneral/searchSettlements → DeliveryCity).
 */
export const SENDER = {
	city: 'Роздільна',
	region: 'Одеська обл.',
	cityRef: 'db5c896e-391c-11dd-90d9-001a92567626',
	/** Адреса для самовивозу. TODO: додати вулицю й номер будинку. */
	pickupAddress: 'Роздільна, Одеська обл.',
	pickupHours: 'щодня з 10:00 до 20:00'
} as const;

/** Розміри в порядку зростання — використовується для сортування фільтрів. */
export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

export const PRODUCTS_PER_PAGE = 12;

/**
 * Стеля кількості однієї позиції — захист від підробленої форми.
 * Реальний ліміт усе одно залишок на складі.
 */
export const MAX_CART_QUANTITY = 99;

/**
 * Скільки днів на обмін і повернення. Число живе тут одне: воно йде і в
 * тексти на сайті, і в розмітку товару для Google — розійтись вони не мають.
 */
export const RETURN_DAYS = 14;

/** Безкоштовна доставка від цієї суми (у копійках). */
export const FREE_DELIVERY_FROM = 300_000;

/**
 * Сортування каталогу.
 *
 * `label` — те, що бачить покупець (коротко, без «дешевші/дорожчі»);
 * напрям ціни показує стрілка. `hint` іде в title і aria-label — інакше
 * два пункти «Ціна» звучали б у скрінрідері однаково.
 */
export const SORT_OPTIONS = [
	{ value: 'new', label: 'Новинки', direction: null, hint: 'Спочатку нові надходження' },
	{ value: 'price-asc', label: 'Ціна', direction: 'asc', hint: 'Ціна: від меншої до більшої' },
	{ value: 'price-desc', label: 'Ціна', direction: 'desc', hint: 'Ціна: від більшої до меншої' }
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]['value'];

/**
 * Способи доставки.
 *
 * `carrier` вмикає автодоповнення міста й відділення з API перевізника,
 * `kind` визначає, які поля показати: відділення зі списку, вулицю вручну
 * чи нічого (самовивіз). `days` — [мінімум, максимум] днів у дорозі після
 * відправки; з них сторінка товару рахує конкретну дату отримання.
 */
export const DELIVERY_METHODS = [
	{
		value: 'NOVA_POSHTA_BRANCH',
		days: [1, 3] as readonly [number, number],
		label: 'Нова Пошта — відділення',
		hint: 'Доставка 1–3 дні',
		cost: 9000,
		carrier: 'nova-poshta',
		kind: 'branch'
	},
	{
		value: 'NOVA_POSHTA_COURIER',
		days: [1, 3] as readonly [number, number],
		label: 'Нова Пошта — кур’єр',
		hint: 'Доставка за адресою, 1–3 дні',
		cost: 14000,
		carrier: 'nova-poshta',
		kind: 'courier'
	},
	{
		// Довідник Укрпошти не підключений — адреса вводиться вручну.
		value: 'UKRPOSHTA_BRANCH',
		days: [2, 5] as readonly [number, number],
		label: 'Укрпошта — відділення',
		hint: 'Доставка 2–5 днів, дешевше',
		cost: 6000,
		carrier: null,
		kind: 'branch'
	},
	{
		value: 'PICKUP',
		days: [0, 0] as readonly [number, number],
		label: 'Самовивіз із шоуруму',
		hint: SENDER.pickupAddress,
		cost: 0,
		carrier: null,
		kind: 'pickup'
	}
] as const;

export type DeliveryMethodValue = (typeof DELIVERY_METHODS)[number]['value'];

export function deliveryMethod(value: DeliveryMethodValue) {
	return DELIVERY_METHODS.find((method) => method.value === value) ?? DELIVERY_METHODS[0];
}

/** Вартість доставки з урахуванням порогу безкоштовної. */
export function deliveryCostFor(value: DeliveryMethodValue, subtotal: number): number {
	if (subtotal >= FREE_DELIVERY_FROM) return 0;
	return deliveryMethod(value).cost;
}

/**
 * Таблиці замірів. Ключ — slug категорії, `default` — запасний варіант.
 * Заміри самої речі в застебнутому вигляді, у сантиметрах.
 */
export type SizeChartRow = {
	size: string;
	ua: string;
	chest: number;
	sleeve: number;
	length: number;
};

export type SizeChart = {
	title: string;
	note: string;
	rows: SizeChartRow[];
};

const OUTERWEAR_CHART: SizeChart = {
	title: 'Заміри куртки, см',
	note: 'Заміри самої куртки в застебнутому вигляді, у сантиметрах.',
	rows: [
		{
			size: 'XS',
			ua: '40–42',
			chest: 96,
			sleeve: 60,
			length: 92
		},
		{
			size: 'S',
			ua: '44',
			chest: 100,
			sleeve: 61,
			length: 94
		},
		{ size: 'M', ua: '46', chest: 104, sleeve: 62, length: 96 },
		{ size: 'L', ua: '48', chest: 109, sleeve: 63, length: 98 },
		{
			size: 'XL',
			ua: '50–52',
			chest: 114,
			sleeve: 64,
			length: 100
		}
	]
};

const DEFAULT_CHART: SizeChart = {
	title: 'Заміри виробу, см',
	note: 'Заміри самої речі в розкладеному вигляді, у сантиметрах.',
	rows: [
		{ size: 'XS', ua: '40–42', chest: 84, sleeve: 58, length: 88 },
		{ size: 'S', ua: '44', chest: 88, sleeve: 59, length: 90 },
		{ size: 'M', ua: '46', chest: 92, sleeve: 60, length: 92 },
		{ size: 'L', ua: '48', chest: 97, sleeve: 61, length: 94 },
		{
			size: 'XL',
			ua: '50–52',
			chest: 102,
			sleeve: 62,
			length: 96
		}
	]
};

const SIZE_CHARTS: Record<string, SizeChart> = {
	'verkhniy-odiah': OUTERWEAR_CHART,
	trykotazh: {
		title: 'Заміри трикотажу, см',
		note: 'Трикотаж тягнеться — заміри наведені без розтягування. Якщо любите вільну посадку, беріть на розмір більше.',
		rows: [
			{ size: 'XS', ua: '40–42', chest: 88, sleeve: 59, length: 62 },
			{ size: 'S', ua: '44', chest: 92, sleeve: 60, length: 64 },
			{
				size: 'M',
				ua: '46',
				chest: 96,
				sleeve: 61,
				length: 66
			},
			{ size: 'L', ua: '48', chest: 101, sleeve: 62, length: 68 },
			{
				size: 'XL',
				ua: '50–52',
				chest: 106,
				sleeve: 63,
				length: 70
			}
		]
	}
};

export function sizeChartFor(categorySlug: string): SizeChart {
	return SIZE_CHARTS[categorySlug] ?? DEFAULT_CHART;
}

export const ORDER_STATUS_LABELS = {
	NEW: 'Нове',
	CONFIRMED: 'Підтверджене',
	SHIPPED: 'Відправлене',
	DELIVERED: 'Доставлене',
	CANCELLED: 'Скасоване'
} as const;
