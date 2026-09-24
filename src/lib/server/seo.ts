import { IMAGE_LARGE, imageSrc } from '$lib/image';
import { framesForColor } from '$lib/product-images';
import { deliveryMethod, FREE_DELIVERY_FROM, RETURN_DAYS, SENDER, SITE } from '$lib/config';
import { formatPrice } from '$lib/money';
import { plural } from '$lib/plural';
import type { ProductCard, ProductDetail } from '$lib/types';

/**
 * Розмітка Schema.org для пошуковиків.
 *
 * Google показує картки товару з ціною й наявністю тільки тоді, коли бачить
 * коректний JSON-LD. Тут він і збирається — на сервері, з тих самих даних,
 * що бачить покупець. Вигадувати нічого не можна: рейтинги, відгуки й строки,
 * яких немає в базі, у розмітці не з'являються — за таке Google знімає картки
 * з видачі цілком.
 *
 * Вставку в HTML робить hooks.server.ts: у Svelte немає способу віддати
 * тег <script> із шаблону без {@html}, а це прямий шлях до XSS.
 */

/** Вузол графа — звичайний об'єкт Schema.org без @context. */
export type JsonLdNode = Record<string, unknown>;

/** Копійки → рядок у гривнях, як того вимагає Schema.org: "1299.00". */
function money(kopiyky: number): string {
	return (kopiyky / 100).toFixed(2);
}

function absolute(origin: string, path: string): string {
	return new URL(path, origin).href;
}

/** Ідентифікатори вузлів, щоб на них могли посилатись інші. */
const storeId = (origin: string) => `${origin}/#store`;
const websiteId = (origin: string) => `${origin}/#website`;

/**
 * Магазин. `OnlineStore` — саме той тип, який Google очікує від
 * інтернет-магазину; адреса й регіон роботи дають гео-сигнал по Україні.
 */
export function storeNode(origin: string): JsonLdNode {
	return {
		'@type': 'OnlineStore',
		'@id': storeId(origin),
		name: SITE.name,
		url: `${origin}/`,
		// Логотип магазину. Google бере його в панель знань і в картку бренда;
		// без нього там лишається пустка або випадкова картинка зі сторінки.
		logo: absolute(origin, '/android-chrome-512x512.png'),
		image: absolute(origin, '/android-chrome-512x512.png'),
		description: SITE.description,
		email: SITE.email,
		telephone: SITE.phone,
		sameAs: [SITE.instagram],
		address: {
			'@type': 'PostalAddress',
			addressCountry: 'UA',
			addressRegion: SENDER.region,
			addressLocality: SENDER.city
		},
		areaServed: { '@type': 'Country', name: 'Україна' },
		currenciesAccepted: 'UAH',
		paymentAccepted: 'Готівка, оплата при отриманні',
		knowsLanguage: 'uk-UA'
	};
}

/**
 * Сайт і пошук усередині нього: з цим Google може показати рядок пошуку
 * по магазину прямо у видачі.
 */
export function websiteNode(origin: string): JsonLdNode {
	return {
		'@type': 'WebSite',
		'@id': websiteId(origin),
		url: `${origin}/`,
		name: SITE.name,
		inLanguage: 'uk-UA',
		publisher: { '@id': storeId(origin) },
		potentialAction: {
			'@type': 'SearchAction',
			target: {
				'@type': 'EntryPoint',
				urlTemplate: `${origin}/catalog?q={search_term_string}`
			},
			'query-input': 'required name=search_term_string'
		}
	};
}

/** Хлібні крихти — Google малює їх у видачі замість голого URL. */
export function breadcrumbsNode(
	origin: string,
	trail: { name: string; path: string }[]
): JsonLdNode {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: trail.map((step, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: step.name,
			item: absolute(origin, step.path)
		}))
	};
}

/** Умови доставки й повернення — ті самі, що написані покупцеві на сайті. */
function offerTerms(origin: string) {
	const branch = deliveryMethod('NOVA_POSHTA_BRANCH');

	return {
		shippingDetails: {
			'@type': 'OfferShippingDetails',
			shippingRate: {
				'@type': 'MonetaryAmount',
				value: money(branch.cost),
				currency: 'UAH'
			},
			shippingDestination: {
				'@type': 'DefinedRegion',
				addressCountry: 'UA'
			},
			deliveryTime: {
				'@type': 'ShippingDeliveryTime',
				handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
				transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' }
			},
			// Поріг безкоштовної доставки — теж факт із config.
			freeShippingThreshold: {
				'@type': 'MonetaryAmount',
				value: money(FREE_DELIVERY_FROM),
				currency: 'UAH'
			}
		},
		hasMerchantReturnPolicy: {
			'@type': 'MerchantReturnPolicy',
			applicableCountry: 'UA',
			returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
			merchantReturnDays: RETURN_DAYS,
			returnMethod: 'https://schema.org/ReturnByMail',
			// Сторінка з умовами: Google веде туди з картки товару, а Merchant
			// Center без неї не приймає політику повернення.
			merchantReturnLink: absolute(origin, '/returns')
		},
		seller: { '@id': storeId(origin) }
	};
}

/**
 * Стара ціна поруч із новою: з нею Google може показати знижку прямо в
 * картці товару — закреслена сума й нова поруч. Береться рівно та, що
 * закреслена на сайті: за «знижку», якої покупець не бачить, Google
 * знімає картки з видачі.
 */
function strikethrough(price: number, compareAt: number | null) {
	if (!compareAt || compareAt <= price) return {};

	return {
		priceSpecification: {
			'@type': 'UnitPriceSpecification',
			priceType: 'https://schema.org/StrikethroughPrice',
			price: money(compareAt),
			priceCurrency: 'UAH'
		}
	};
}

function offerNode(
	origin: string,
	url: string,
	price: number,
	inStock: boolean,
	compareAt: number | null = null
) {
	return {
		'@type': 'Offer',
		url,
		priceCurrency: 'UAH',
		price: money(price),
		...strikethrough(price, compareAt),
		availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
		itemCondition: 'https://schema.org/NewCondition',
		...offerTerms(origin)
	};
}

/**
 * Товар.
 *
 * Один розмір — звичайний Product. Кілька — ProductGroup із варіантами:
 * так Google розуміє, що це одна річ у різних розмірах і кольорах, а не
 * купа дублів. У кожного варіанта свій артикул і своя наявність.
 */
/**
 * Характеристики CRM веде вільним списком, а Google розуміє лише кілька
 * власних полів. Витягуємо ті, які він справді читає: склад тканини й
 * країну виробництва. Назви шукаємо без урахування регістра — у CRM
 * пишуть і «Склад», і «склад».
 */
const SCHEMA_ATTRIBUTES: Record<string, string[]> = {
	material: ['склад', 'матеріал', 'тканина'],
	countryOfOrigin: ['країна виробництва', 'країна', 'виробництво'],
	pattern: ['візерунок', 'принт']
};

function schemaAttributes(product: ProductDetail): Record<string, string> {
	const found: Record<string, string> = {};

	for (const [field, names] of Object.entries(SCHEMA_ATTRIBUTES)) {
		const attribute = product.attributes.find((item) => names.includes(item.name.toLowerCase()));
		if (attribute) found[field] = attribute.value;
	}

	return found;
}

export function productNode(origin: string, product: ProductDetail): JsonLdNode {
	const url = absolute(origin, `/product/${product.slug}`);
	// Порядок важливий: Google бере в картку перше фото, а перше має бути
	// того кольору, який реально можна купити. Решту кадрів лишаємо —
	// зайвий ракурс у розмітці не шкодить, а от чорна куртка в картці,
	// коли чорну розібрали, шкодить прямо.
	const preferred = framesForColor(product.images, product.variants[0]?.color ?? null);
	const ordered = [...preferred, ...product.images.filter((image) => !preferred.includes(image))];
	// Google хоче велике фото, але не оригінал на два мегабайти: у розмітку
	// йде та сама ширина, що й у відкритому перегляді.
	const images = ordered.map((image) => absolute(origin, imageSrc(image.url, IMAGE_LARGE)));
	const brand = { '@type': 'Brand', name: SITE.name };

	const base = {
		name: product.name,
		description: product.description,
		image: images,
		brand,
		category: product.category.name,
		...schemaAttributes(product),
		url
	};

	if (product.variants.length <= 1) {
		const variant = product.variants[0];
		return {
			'@type': 'Product',
			...base,
			...(variant ? { sku: variant.sku, mpn: variant.sku } : {}),
			offers: offerNode(
				origin,
				url,
				variant?.price ?? product.price,
				Boolean(variant),
				product.compareAt
			)
		};
	}

	return {
		'@type': 'ProductGroup',
		...base,
		productGroupID: product.slug,
		variesBy: ['https://schema.org/size', 'https://schema.org/color'],
		hasVariant: product.variants.map((variant) => ({
			'@type': 'Product',
			name: `${product.name} — ${variant.color}, розмір ${variant.size}`,
			// Зворотне посилання на групу: без нього Google трактує варіанти
			// як окремі товари й може показати їх у видачі як дублі.
			inProductGroupWithID: product.slug,
			sku: variant.sku,
			mpn: variant.sku,
			image: images,
			brand,
			size: variant.size,
			color: variant.color,
			// Стара ціна відома лише для товару цілком. Варіант із власною ціною
			// її не успадковує — закреслити там нема що.
			offers: offerNode(
				origin,
				url,
				variant.price,
				variant.stock > 0,
				variant.price === product.price ? product.compareAt : null
			)
		}))
	};
}

/**
 * Список товарів на сторінці категорії. Для таких сторінок Google радить
 * саме ItemList із посиланнями — повні картки він бере зі сторінок товарів.
 */
export function itemListNode(origin: string, name: string, products: ProductCard[]): JsonLdNode {
	return {
		'@type': 'ItemList',
		name,
		numberOfItems: products.length,
		itemListElement: products.map((product, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: product.name,
			url: absolute(origin, `/product/${product.slug}`)
		}))
	};
}

/**
 * Граф у тег script.
 *
 * JSON екранується так, щоб у ньому фізично не могло виникнути закривальне
 * "script": усі кутові дужки й амперсанди йдуть \u-послідовностями. Це
 * стандартний спосіб вбудовувати JSON у HTML — і єдиний, який не ламається
 * на назві товару з кутовою дужкою всередині.
 */
export function serializeJsonLd(nodes: JsonLdNode[]): string {
	if (nodes.length === 0) return '';

	const payload = JSON.stringify({
		'@context': 'https://schema.org',
		'@graph': nodes
	})
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		// Подвійний слеш — не описка: потрібен текст `\u2028`, а не сам символ.
		// Одинарний дав би в рядку заміни той самий невидимий розрив рядка,
		// і заміна не робила б нічого.
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');

	return `<script type="application/ld+json">${payload}</script>`;
}

// ─── Тексти сторінки категорії ───────────────────────────────────────────

/**
 * Заголовок категорії в тому вигляді, як її шукають: «жіночі демісезонні
 * куртки», а не голе «Демісезонні куртки». Назва в CRM коротка, бо стоїть
 * у меню, — а в пошуку людина майже завжди уточнює, що шукає жіноче.
 *
 * Якщо «жіноч» у назві вже є, нічого не додаємо: «Жіночі жіночі сукні»
 * виглядали б як зламаний шаблон.
 */
export function categoryHeading(name: string): string {
	if (/жіноч/i.test(name)) return name;
	return `Жіночі ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/** Ціни — у копійках, як і скрізь. */
export type PriceRange = { min: number; max: number };

function priceSpan(range: PriceRange | null): string {
	if (!range) return '';
	if (range.min === range.max) return `, ціна ${formatPrice(range.min)}`;
	return `, від ${formatPrice(range.min)} до ${formatPrice(range.max)}`;
}

function modelsInStock(total: number): string {
	return `${total} ${plural(total, 'модель', 'моделі', 'моделей')} у наявності`;
}

/**
 * Вступ під заголовком категорії.
 *
 * Лише факти, які вже є в базі й у налаштуваннях: скільки моделей, у якому
 * діапазоні ціни, як швидко й за скільки доставка, скільки днів на обмін.
 * Саме такі факти цитують ІІ-асистенти, коли їх питають «де купити», і
 * саме за них пошуковик відрізняє сторінку категорії від порожньої сітки.
 * Вигадувати тут нічого не можна: текст оновлюється разом із каталогом.
 */
export function categoryIntro(name: string, total: number, range: PriceRange | null): string {
	return [
		`${categoryHeading(name)} від ${SITE.name}: ${modelsInStock(total)}${priceSpan(range)}.`,
		...serviceFacts()
	].join(' ');
}

/** Доставка й обмін — однаково для категорії й колекції. */
function serviceFacts(): string[] {
	const [from, to] = deliveryMethod('NOVA_POSHTA_BRANCH').days;
	return [
		`Доставка Новою Поштою по всій Україні за ${from}–${to} ${plural(to, 'день', 'дні', 'днів')}, безкоштовно від ${formatPrice(FREE_DELIVERY_FROM)}.`,
		`Обмін і повернення — ${RETURN_DAYS} ${plural(RETURN_DAYS, 'день', 'дні', 'днів')}.`
	];
}

/**
 * Опис для видачі — коротша версія вступу. Google показує близько 160
 * символів, і ціна з кількістю мають вміститись у них першими.
 */
export function categoryDescription(name: string, total: number, range: PriceRange | null): string {
	return `${categoryHeading(name)} — ${modelsInStock(total)}${priceSpan(range)}. Доставка по Україні, обмін ${RETURN_DAYS} ${plural(RETURN_DAYS, 'день', 'дні', 'днів')}.`;
}

// ─── Тексти сторінки колекції ────────────────────────────────────────────

/**
 * Від і до скільки коштує все на сторінці. Рахується з уже вибраних карток:
 * окремий агрегат у базі повторив би той самий запит.
 */
export function priceRangeOf(products: ProductCard[]): PriceRange | null {
	if (products.length === 0) return null;
	const prices = products.map((product) => product.price);
	return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** «демісезонні куртки, пальто, бомбери» — з чого складається колекція. */
function shelfList(shelves: string[]): string {
	return shelves.map((name) => name.toLowerCase()).join(', ');
}

/**
 * Вступ колекції — ті самі факти, що й у категорії, плюс її склад. Саме
 * склад пошуковик і асистент зіставляють із запитом на кшталт «осінній
 * жіночий верхній одяг»: слова «колекція» в такому запиті немає.
 */
export function collectionIntro(
	name: string,
	total: number,
	range: PriceRange | null,
	shelves: string[]
): string {
	return [
		`${name} ${SITE.name}: ${modelsInStock(total)}${priceSpan(range)} — ${shelfList(shelves)}.`,
		...serviceFacts()
	].join(' ');
}

/** Заголовок у видачі: три перші полиці — найважливіше, що в колекції є. */
export function collectionTitle(name: string, shelves: string[]): string {
	const lead = shelves.length > 0 ? ` — ${shelfList(shelves.slice(0, 3))}` : '';
	return `${name} жіночого одягу${lead} | ${SITE.name}`;
}

export function collectionDescription(
	name: string,
	total: number,
	range: PriceRange | null,
	shelves: string[]
): string {
	return `${name} жіночого одягу — ${modelsInStock(total)}${priceSpan(range)}: ${shelfList(shelves.slice(0, 3))}. Доставка по Україні, обмін ${RETURN_DAYS} ${plural(RETURN_DAYS, 'день', 'дні', 'днів')}.`;
}
