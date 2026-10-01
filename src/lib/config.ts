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
 * Скільки живе відповідь каталогу в пам'яті сервера. Каталог веде CRM, і
 * правки доїжджають на сайт за цю хвилину; сторінка товару не кешується
 * взагалі — там вирішує залишок на складі.
 */
export const CATALOG_CACHE_MS = 60_000;

/**
 * Посилання, яке вимикає підрахунок відвідуваності на пристрої команди:
 * https://lilylook.store/?ne-rahuvaty=komanda-lily-7q2
 *
 * Відкрити один раз на кожному телефоні й комп'ютері, з якого перевіряєте
 * сайт. Це не пароль: хто випадково знайде — лише вимкне статистику собі.
 */
export const ANALYTICS_OPT_OUT = { param: 'ne-rahuvaty', key: 'komanda-lily-7q2' } as const;

/**
 * Пошук. Підказки починаються з двох літер — на одній знаходиться пів
 * каталогу, і запит на кожну натиснуту літеру був би марним.
 */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_SUGGESTIONS = 6;

/**
 * Головна сторінка.
 *
 * `HOME_BLOCK_SIZE` — рівно один ряд карток на десктопі в блоках «Знижки»
 * і «Новинки». Стрічка категорії показує категорію цілком, без обрізання й
 * кнопки «ще»: фото в ній вантажаться ліниво, тож довга стрічка не гальмує
 * відкриття головної.
 * `HOME_EAGER_SECTIONS` — скільки стрічок категорій віддає сервер одразу
 * в HTML (їх видно майже без прокрутки й вони мають бути в індексі);
 * усі наступні довантажуються, коли покупець до них догортає.
 */
export const HOME_BLOCK_SIZE = 4;
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
 * Колесо фортуни для нових відвідувачів: знижки до 10 % на все замовлення
 * (і на акційні речі теж) або безкоштовна доставка. Лише знижки й
 * доставка — жодних фізичних подарунків: за якість чужого товару в
 * посилці відповідав би магазин.
 *
 * `weight` — шанс приза: «Ще спроба» (2 із 27, ≈7 %) випадає рідше за
 * решту (5 із 27, ≈18,5 % кожен). На колесі ж усі сектори однакові —
 * так воно симетричне й гарне. «Ще спроба» — не приз: колесо можна
 * крутити ще раз. Сектори йдуть по колу в цьому порядку.
 *
 * `code` пишеться в базу (`WheelSpin.prize`), тож міняти його в уже
 * розіграних призах не можна; назву, вагу й порядок — можна.
 */
export const WHEEL_PRIZES = [
	{ code: 'off5', label: 'Знижка 5%', percent: 5, freeDelivery: false, weight: 5 },
	{ code: 'off10', label: 'Знижка 10%', percent: 10, freeDelivery: false, weight: 5 },
	{ code: 'off3', label: 'Знижка 3%', percent: 3, freeDelivery: false, weight: 5 },
	{ code: 'delivery', label: 'Безкоштовна доставка', percent: 0, freeDelivery: true, weight: 5 },
	{ code: 'off7', label: 'Знижка 7%', percent: 7, freeDelivery: false, weight: 5 },
	{ code: 'retry', label: 'Ще спроба', percent: 0, freeDelivery: false, weight: 2 }
] as const;

export type WheelPrizeCode = (typeof WHEEL_PRIZES)[number]['code'];

/** Скільки годин діє виграний приз. */
export const WHEEL_PRIZE_HOURS = 24;

/** Через скільки секунд на сайті зʼявляється колесо (або одразу на другій сторінці). */
export const WHEEL_DELAY_MS = 25_000;

/**
 * Сезонні колекції — добірки з кількох категорій на одній сторінці
 * (`/collection/<slug>`).
 *
 * Склад задається категоріями, а не товарами: нова куртка, яку CRM поставить
 * у «Зимові куртки», сама потрапить і в колекцію, а розпродана — зникне.
 * Порядок категорій — порядок полиць на сторінці. Категорію перейменували в
 * CRM разом з адресою — її треба поправити й тут, інакше полиця тихо зникне.
 */
export type Collection = {
	slug: string;
	name: string;
	lead: string;
	categories: readonly string[];
	/**
	 * Моделі, що першими стають на свою полицю. Сезон у CRM видно лише з
	 * назви — у «Пальто» лежать і осінні, і зимові, — тож зимова колекція
	 * ставить «Зимове …» й «Тепле …» пальто попереду осінніх. Решта порядку
	 * — як завжди, новіші вище.
	 */
	firstNamed?: RegExp;
};

export const COLLECTIONS: readonly Collection[] = [
	{
		slug: 'winter',
		name: 'Зимова колекція',
		lead: 'Тепло, в якому хочеться гуляти: зимові куртки й пуховики, пальта, демісезонні куртки й бомбери.',
		// Від найактуальнішого зараз до того, що ще носять у теплі зимові дні.
		categories: ['zymovi-kurtky', 'palto', 'demisezonni-kurtky', 'bombery'],
		firstNamed: /зимов|тепл|пух|хутр|утеплен/i
	},
	{
		slug: 'autumn',
		name: 'Осіння колекція',
		lead: 'Теплі образи для прохолодних днів: верхній одяг на осінь — від легкої вітровки до пальта.',
		categories: ['demisezonni-kurtky', 'palto', 'bombery', 'vitrovky', 'zhyletky', 'zhakety']
	}
];

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
 *
 * Ціни доставки тут немає свідомо: див. `isDeliveryFree`.
 */
export const DELIVERY_METHODS = [
	{
		value: 'NOVA_POSHTA_BRANCH',
		days: [1, 3] as readonly [number, number],
		label: 'Нова Пошта — відділення',
		hint: 'Доставка 1–3 дні',
		carrier: 'nova-poshta',
		kind: 'branch'
	},
	{
		value: 'NOVA_POSHTA_COURIER',
		days: [1, 3] as readonly [number, number],
		label: 'Нова Пошта — кур’єр',
		hint: 'Доставка за адресою, 1–3 дні',
		carrier: 'nova-poshta',
		kind: 'courier'
	},
	{
		// Довідник Укрпошти не підключений — адреса вводиться вручну.
		value: 'UKRPOSHTA_BRANCH',
		days: [2, 5] as readonly [number, number],
		label: 'Укрпошта — відділення',
		hint: 'Доставка 2–5 днів, дешевше',
		carrier: null,
		kind: 'branch'
	},
	{
		value: 'PICKUP',
		days: [0, 0] as readonly [number, number],
		label: 'Самовивіз із шоуруму',
		hint: SENDER.pickupAddress,
		carrier: null,
		kind: 'pickup'
	}
] as const;

export type DeliveryMethodValue = (typeof DELIVERY_METHODS)[number]['value'];

export function deliveryMethod(value: DeliveryMethodValue) {
	return DELIVERY_METHODS.find((method) => method.value === value) ?? DELIVERY_METHODS[0];
}

/**
 * Куди везти, ще не відомо — замовлення «в 1 клік»: покупець лишив лише
 * ім'я й телефон, місто й відділення менеджер уточнить дзвінком. Звичайне
 * оформлення без міста не пропускає (`validateDelivery`), тож доставка без
 * міста — рівно цей випадок.
 */
export function isAddressPending(order: {
	method: DeliveryMethodValue;
	city: string | null;
}): boolean {
	return deliveryMethod(order.method).kind !== 'pickup' && !order.city;
}

/**
 * Чи безкоштовна доставка для покупця.
 *
 * Самовивіз — завжди, а від порогу — будь-яким способом: перевізнику тоді
 * платить магазин. В інших випадках покупець платить перевізнику сам, на
 * пошті, за його тарифом — і сайт суми не називає. Точно її не знає ніхто,
 * крім перевізника: тариф залежить від ваги й оголошеної вартості, а з
 * оплатою при отриманні Нова Пошта ще бере комісію за переказ грошей
 * (близько 20 грн + 2 %). Колись тут стояли «90 грн», а на пошті покупець
 * платив півтори сотні — обіцянка, за яку потім претензії до магазину.
 */
export function isDeliveryFree(
	value: DeliveryMethodValue,
	subtotal: number,
	/** Безкоштовну доставку виграно в колесі фортуни. */
	prizeFree = false
): boolean {
	return prizeFree || deliveryMethod(value).kind === 'pickup' || subtotal >= FREE_DELIVERY_FROM;
}

export const ORDER_STATUS_LABELS = {
	NEW: 'Нове',
	CONFIRMED: 'Підтверджене',
	SHIPPED: 'Відправлене',
	DELIVERED: 'Доставлене',
	CANCELLED: 'Скасоване'
} as const;
