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

/** Безкоштовна доставка від цієї суми (у копійках). */
export const FREE_DELIVERY_FROM = 200_000;

export const SORT_OPTIONS = [
	{ value: 'new', label: 'Спочатку новинки' },
	{ value: 'price-asc', label: 'Спочатку дешевші' },
	{ value: 'price-desc', label: 'Спочатку дорожчі' }
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]['value'];

/**
 * Способи доставки.
 *
 * `carrier` вмикає автодоповнення міста й відділення з API перевізника,
 * `kind` визначає, які поля показати: відділення зі списку, вулицю вручну
 * чи нічого (самовивіз).
 */
export const DELIVERY_METHODS = [
	{
		value: 'NOVA_POSHTA_BRANCH',
		label: 'Нова Пошта — відділення',
		hint: 'Доставка 1–3 дні',
		cost: 9000,
		carrier: 'nova-poshta',
		kind: 'branch'
	},
	{
		value: 'NOVA_POSHTA_COURIER',
		label: 'Нова Пошта — кур’єр',
		hint: 'Доставка за адресою, 1–3 дні',
		cost: 14000,
		carrier: 'nova-poshta',
		kind: 'courier'
	},
	{
		// Довідник Укрпошти не підключений — адреса вводиться вручну.
		value: 'UKRPOSHTA_BRANCH',
		label: 'Укрпошта — відділення',
		hint: 'Доставка 2–5 днів, дешевше',
		cost: 6000,
		carrier: null,
		kind: 'branch'
	},
	{
		value: 'PICKUP',
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
	/** Що реально вміститься під низ без тиску в плечах. */
	underneath: string;
};

export type SizeChart = {
	title: string;
	note: string;
	rows: SizeChartRow[];
};

const OUTERWEAR_CHART: SizeChart = {
	title: 'Заміри куртки, см',
	note: 'Заміри самої куртки в застебнутому вигляді. Остання колонка — що реально вміститься під низ без тиску в плечах.',
	rows: [
		{
			size: 'XS',
			ua: '40–42',
			chest: 96,
			sleeve: 60,
			length: 92,
			underneath: 'футболка й тонкий світшот'
		},
		{
			size: 'S',
			ua: '44',
			chest: 100,
			sleeve: 61,
			length: 94,
			underneath: 'светр середньої в’язки'
		},
		{ size: 'M', ua: '46', chest: 104, sleeve: 62, length: 96, underneath: 'светр або тонке худі' },
		{ size: 'L', ua: '48', chest: 109, sleeve: 63, length: 98, underneath: 'щільний светр і худі' },
		{
			size: 'XL',
			ua: '50–52',
			chest: 114,
			sleeve: 64,
			length: 100,
			underneath: 'щільний светр і флісова кофта'
		}
	]
};

const DEFAULT_CHART: SizeChart = {
	title: 'Заміри виробу, см',
	note: 'Заміри самої речі в розкладеному вигляді. Остання колонка — з чим річ найкраще носиться.',
	rows: [
		{ size: 'XS', ua: '40–42', chest: 84, sleeve: 58, length: 88, underneath: 'базовий топ' },
		{ size: 'S', ua: '44', chest: 88, sleeve: 59, length: 90, underneath: 'тонкий гольф' },
		{ size: 'M', ua: '46', chest: 92, sleeve: 60, length: 92, underneath: 'футболка або гольф' },
		{ size: 'L', ua: '48', chest: 97, sleeve: 61, length: 94, underneath: 'тонкий светр' },
		{
			size: 'XL',
			ua: '50–52',
			chest: 102,
			sleeve: 62,
			length: 96,
			underneath: 'светр середньої в’язки'
		}
	]
};

const SIZE_CHARTS: Record<string, SizeChart> = {
	'verkhniy-odiah': OUTERWEAR_CHART,
	trykotazh: {
		title: 'Заміри трикотажу, см',
		note: 'Трикотаж тягнеться — заміри наведені без розтягування. Якщо любите вільну посадку, беріть на розмір більше.',
		rows: [
			{ size: 'XS', ua: '40–42', chest: 88, sleeve: 59, length: 62, underneath: 'тонкий топ' },
			{ size: 'S', ua: '44', chest: 92, sleeve: 60, length: 64, underneath: 'футболка' },
			{
				size: 'M',
				ua: '46',
				chest: 96,
				sleeve: 61,
				length: 66,
				underneath: 'футболка або сорочка'
			},
			{ size: 'L', ua: '48', chest: 101, sleeve: 62, length: 68, underneath: 'сорочка' },
			{
				size: 'XL',
				ua: '50–52',
				chest: 106,
				sleeve: 63,
				length: 70,
				underneath: 'сорочка вільного крою'
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
