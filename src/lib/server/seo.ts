import { deliveryMethod, FREE_DELIVERY_FROM, RETURN_DAYS, SENDER, SITE } from '$lib/config';
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
			returnMethod: 'https://schema.org/ReturnByMail'
		},
		seller: { '@id': storeId(origin) }
	};
}

function offerNode(origin: string, url: string, price: number, inStock: boolean) {
	return {
		'@type': 'Offer',
		url,
		priceCurrency: 'UAH',
		price: money(price),
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
	const images = product.images.map((image) => absolute(origin, image.url));
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
			offers: offerNode(origin, url, variant?.price ?? product.price, Boolean(variant))
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
			offers: offerNode(origin, url, variant.price, variant.stock > 0)
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
		.replace(/\u2028/g, '\u2028')
		.replace(/\u2029/g, '\u2029');

	return `<script type="application/ld+json">${payload}</script>`;
}
