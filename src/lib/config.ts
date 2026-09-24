/** Єдине місце з бізнес-константами магазину. */

export const SITE = {
	name: 'LILY LOOK',
	tagline: 'Жіночий одяг з характером',
	description:
		'LILY LOOK — сукні, костюми, верхній одяг і базові речі для щоденного гардеробу. Доставка по всій Україні.',
	phone: '+38 (067) 658-34-86',
	email: 'support@lilylook.store',
	instagram: 'https://www.instagram.com/lily.look.ua/'
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
 * Головна сторінка.
 *
 * `HOME_BLOCK_SIZE` — рівно один ряд карток на десктопі в блоках «Знижки»
 * і «Новинки». `HOME_CATEGORY_LIMIT` — скільки речей показує стрічка однієї
 * категорії; решта лишається за посиланням «Уся категорія», інакше головна
 * перетворилась би на весь каталог одним полотном.
 * `HOME_EAGER_SECTIONS` — скільки стрічок категорій віддає сервер одразу
 * в HTML (їх видно майже без прокрутки й вони мають бути в індексі);
 * усі наступні довантажуються, коли покупець до них догортає.
 */
/**
 * Скільки живе відповідь каталогу в пам'яті сервера. Каталог веде CRM, і
 * правки доїжджають на сайт за цю хвилину; сторінка товару не кешується
 * взагалі — там вирішує залишок на складі.
 */
export const CATALOG_CACHE_MS = 60_000;

/**
 * Пошук. Підказки починаються з двох літер — на одній знаходиться пів
 * каталогу, і запит на кожну натиснуту літеру був би марним.
 */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_SUGGESTIONS = 6;

export const HOME_BLOCK_SIZE = 4;
export const HOME_CATEGORY_LIMIT = 8;
export const HOME_EAGER_SECTIONS = 2;

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
export const FREE_DELIVERY_FROM = 400_000;

/**
 * Сортування каталогу.
 *
 * `label` — те, що бачить покупець (коротко, без «дешевші/дорожчі»);
 * напрям ціни показує стрілка. `hint` іде в title і aria-label — інакше
 * два пункти «Ціна» звучали б у скрінрідері однаково.
 * Підказка мусить починатись із самого `label`: той, хто керує голосом, каже
 * «натисни Новинки», і без цього слова в назві кнопку не знайде.
 */
export const SORT_OPTIONS = [
	{ value: 'new', label: 'Новинки', direction: null, hint: 'Новинки: спочатку нові надходження' },
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

export const ORDER_STATUS_LABELS = {
	NEW: 'Нове',
	CONFIRMED: 'Підтверджене',
	SHIPPED: 'Відправлене',
	DELIVERED: 'Доставлене',
	CANCELLED: 'Скасоване'
} as const;
