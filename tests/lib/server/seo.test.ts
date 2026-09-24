import { RETURN_DAYS } from '$lib/config';
import { formatPrice } from '$lib/money';
import type { ProductCard, ProductDetail } from '$lib/types';
import { describe, expect, it } from 'vitest';
import {
	breadcrumbsNode,
	categoryDescription,
	categoryHeading,
	categoryIntro,
	collectionDescription,
	collectionIntro,
	collectionTitle,
	itemListNode,
	priceRangeOf,
	productNode,
	serializeJsonLd,
	storeNode,
	websiteNode
} from '$lib/server/seo';

/**
 * Розмітка для Google. Помилка тут не ламає сайт, тому її легко не помітити —
 * а платить за неї магазин зниклими картками товару у видачі. Тому перевіряємо
 * і зміст (ціна, наявність, артикул), і безпеку вставки в HTML.
 */

const ORIGIN = 'https://lilylook.store';

const product: ProductDetail = {
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сатинова сукня Olivia',
	description: 'Сатин зі шляхетним блиском.',
	price: 219_900,
	compareAt: 299_900,
	category: { slug: 'sukni', name: 'Сукні' },
	images: [{ url: 'https://cdn.test/1.jpg', alt: 'фото', color: null }],
	measurements: [],
	attributes: [
		{ name: 'Склад', value: '95% віскоза, 5% еластан' },
		{ name: 'Країна виробництва', value: 'Україна' }
	],
	variants: [
		{
			id: 'v1',
			sku: 'OLIVIA-S-CHORNYI',
			size: 'S',
			color: 'Чорний',
			colorHex: '#000',
			price: 219_900,
			stock: 3,
			position: 0
		},
		{
			id: 'v2',
			sku: 'OLIVIA-M-CHORNYI',
			size: 'M',
			color: 'Чорний',
			colorHex: '#000',
			price: 219_900,
			stock: 0,
			position: 1
		}
	]
};

/** Дістає вузол потрібного типу з готового графа. */
function parse(script: string) {
	const json = script.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
	return JSON.parse(json);
}

describe('товар', () => {
	it('кілька розмірів — це ProductGroup з варіантами', () => {
		const node = productNode(ORIGIN, product) as Record<string, unknown>;

		expect(node['@type']).toBe('ProductGroup');
		expect(node.productGroupID).toBe('suknia-olivia');
		expect(node.variesBy).toEqual(['https://schema.org/size', 'https://schema.org/color']);
		expect((node.hasVariant as unknown[]).length).toBe(2);
	});

	it('кожен варіант посилається на свою групу', () => {
		const node = productNode(ORIGIN, product) as Record<string, unknown>;
		const variants = node.hasVariant as { inProductGroupWithID: string }[];

		expect(variants.every((v) => v.inProductGroupWithID === 'suknia-olivia')).toBe(true);
	});

	it('ціна йде в гривнях рядком, як вимагає Schema.org', () => {
		const node = productNode(ORIGIN, product) as Record<string, unknown>;
		const variants = node.hasVariant as { offers: Record<string, unknown> }[];

		expect(variants[0].offers.price).toBe('2199.00');
		expect(variants[0].offers.priceCurrency).toBe('UAH');
	});

	it('наявність рахується по кожному розміру окремо', () => {
		const node = productNode(ORIGIN, product) as Record<string, unknown>;
		const variants = node.hasVariant as { sku: string; offers: Record<string, unknown> }[];

		expect(variants[0].offers.availability).toBe('https://schema.org/InStock');
		expect(variants[1].offers.availability).toBe('https://schema.org/OutOfStock');
		expect(variants[0].sku).toBe('OLIVIA-S-CHORNYI');
	});

	it('один розмір — звичайний Product', () => {
		const node = productNode(ORIGIN, {
			...product,
			variants: [product.variants[0]]
		}) as Record<string, unknown>;

		expect(node['@type']).toBe('Product');
		expect(node.sku).toBe('OLIVIA-S-CHORNYI');
		expect((node.offers as Record<string, unknown>).availability).toBe(
			'https://schema.org/InStock'
		);
	});

	it('розпроданий товар не бреше про наявність', () => {
		const node = productNode(ORIGIN, { ...product, variants: [] }) as Record<string, unknown>;

		expect((node.offers as Record<string, unknown>).availability).toBe(
			'https://schema.org/OutOfStock'
		);
	});

	it('умови доставки й повернення збігаються з тими, що на сайті', () => {
		const node = productNode(ORIGIN, product) as Record<string, unknown>;
		const offer = (node.hasVariant as { offers: Record<string, unknown> }[])[0].offers;
		const returns = offer.hasMerchantReturnPolicy as Record<string, unknown>;

		expect(returns.merchantReturnDays).toBe(RETURN_DAYS);
		expect(returns.applicableCountry).toBe('UA');
	});

	it('склад і країна лягають у поля, які Google справді читає', () => {
		const node = productNode(ORIGIN, product) as Record<string, unknown>;

		expect(node.material).toBe('95% віскоза, 5% еластан');
		expect(node.countryOfOrigin).toBe('Україна');
	});

	it('без характеристик зайвих полів у розмітці не зʼявляється', () => {
		const node = productNode(ORIGIN, { ...product, attributes: [] }) as Record<string, unknown>;

		expect(node).not.toHaveProperty('material');
		expect(node).not.toHaveProperty('countryOfOrigin');
	});

	it('посилання й фото — абсолютні', () => {
		const node = productNode(ORIGIN, {
			...product,
			images: [{ url: '/uploads/1.jpg', alt: '', color: null }]
		}) as Record<string, unknown>;

		expect(node.url).toBe(`${ORIGIN}/product/suknia-olivia`);
		expect(node.image).toEqual([`${ORIGIN}/uploads/1.jpg`]);
	});

	/**
	 * Google бере в картку перше фото зі списку. Якщо чорний розібрали,
	 * першим має стояти білий кадр — той самий, що й на картці товару
	 * в каталозі, і той, що відкриється за кліком.
	 */
	it('першим іде фото кольору, який є в наявності', () => {
		const node = productNode(ORIGIN, {
			...product,
			// У варіантах лишився тільки білий: чорний відсіявся по залишку.
			variants: [{ ...product.variants[0], id: 'v-bi', color: 'Білий' }],
			images: [
				{ url: '/ch-1.jpg', alt: '', color: 'Чорний' },
				{ url: '/bi-1.jpg', alt: '', color: 'Білий' }
			]
		}) as Record<string, unknown>;

		expect(node.image).toEqual([`${ORIGIN}/bi-1.jpg`, `${ORIGIN}/ch-1.jpg`]);
	});
});

describe('магазин і сайт', () => {
	it('гео-сигнал вказує на Україну', () => {
		const node = storeNode(ORIGIN) as Record<string, unknown>;
		const address = node.address as Record<string, unknown>;

		expect(node['@type']).toBe('OnlineStore');
		expect(address.addressCountry).toBe('UA');
		expect(node.currenciesAccepted).toBe('UAH');
	});

	it('логотип — абсолютне посилання: Google відносних не бере', () => {
		const node = storeNode(ORIGIN) as Record<string, unknown>;

		expect(node.logo).toBe(`${ORIGIN}/android-chrome-512x512.png`);
	});

	it('пошук по сайту описаний посиланням на каталог', () => {
		const action = websiteNode(ORIGIN).potentialAction as {
			target: { urlTemplate: string };
		};

		expect(action.target.urlTemplate).toBe(`${ORIGIN}/catalog?q={search_term_string}`);
	});
});

describe('списки', () => {
	it('крихти нумеруються з одиниці', () => {
		const node = breadcrumbsNode(ORIGIN, [
			{ name: 'Головна', path: '/' },
			{ name: 'Сукні', path: '/catalog/sukni' }
		]);
		const items = node.itemListElement as { position: number; item: string }[];

		expect(items[0].position).toBe(1);
		expect(items[1].item).toBe(`${ORIGIN}/catalog/sukni`);
	});

	it('список категорії веде на сторінки товарів', () => {
		const node = itemListNode(ORIGIN, 'Сукні', [
			{
				id: 'p1',
				slug: 'suknia-olivia',
				name: 'Olivia',
				price: 219_900,
				compareAt: null,
				image: null,
				hoverImage: null,
				colors: [],
				inStock: true
			}
		]);

		expect(node.numberOfItems).toBe(1);
		expect((node.itemListElement as { url: string }[])[0].url).toBe(
			`${ORIGIN}/product/suknia-olivia`
		);
	});
});

describe('вставка в HTML', () => {
	it('порожній граф не породжує порожнього тега', () => {
		expect(serializeJsonLd([])).toBe('');
	});

	it('назва з розміткою не може закрити тег script', () => {
		const script = serializeJsonLd([
			productNode(ORIGIN, { ...product, name: '</script><img src=x onerror=alert(1)>' })
		]);

		// Головне: у вихідному рядку немає жодного закривального тега, крім нашого.
		expect(script.match(/<\/script>/g)).toHaveLength(1);
		expect(script).not.toContain('<img');
		expect(script).toContain('\\u003c');
	});

	it('після екранування JSON лишається валідним і не втрачає зміст', () => {
		const script = serializeJsonLd([storeNode(ORIGIN), websiteNode(ORIGIN)]);
		const graph = parse(script);

		expect(graph['@context']).toBe('https://schema.org');
		expect(graph['@graph']).toHaveLength(2);
		expect(graph['@graph'][0].name).toBeTruthy();
	});
});

describe('знижка в розмітці', () => {
	type Offer = { price: string; priceSpecification?: Record<string, unknown> };

	/** Пропозиції варіантів — у тому порядку, в якому їх бачить Google. */
	function variantOffers(detail: ProductDetail): Offer[] {
		const node = productNode(ORIGIN, detail) as Record<string, unknown>;
		return (node.hasVariant as { offers: Offer }[]).map((variant) => variant.offers);
	}

	/** Закреслена ціна в картці Google — лише та, що закреслена й на сайті. */
	it('варіант зі спільною ціною показує стару ціну закресленою', () => {
		const [offer] = variantOffers(product);

		expect(offer.price).toBe('2199.00');
		expect(offer.priceSpecification).toEqual({
			'@type': 'UnitPriceSpecification',
			priceType: 'https://schema.org/StrikethroughPrice',
			price: '2999.00',
			priceCurrency: 'UAH'
		});
	});

	it('без знижки закресленої ціни немає', () => {
		const [offer] = variantOffers({ ...product, compareAt: null });

		expect(offer.priceSpecification).toBeUndefined();
	});

	/**
	 * Власна ціна варіанта не успадковує стару ціну товару: закреслити
	 * 2 999 над варіантом за 2 500 означало б вигадати знижку.
	 */
	it('варіант із власною ціною знижки товару не отримує', () => {
		const [own, shared] = variantOffers({
			...product,
			variants: [{ ...product.variants[0], price: 250_000 }, product.variants[1]]
		});

		expect(own.priceSpecification).toBeUndefined();
		expect(shared.priceSpecification).toBeDefined();
	});

	it('звичайний товар з одним розміром теж показує знижку', () => {
		const node = productNode(ORIGIN, { ...product, variants: [product.variants[0]] }) as Record<
			string,
			unknown
		>;
		const offer = node.offers as Offer;

		expect(node['@type']).toBe('Product');
		expect(offer.priceSpecification?.price).toBe('2999.00');
	});
});

describe('тексти категорії', () => {
	it('заголовок уточнює, що одяг жіночий, — так його й шукають', () => {
		expect(categoryHeading('Демісезонні куртки')).toBe('Жіночі демісезонні куртки');
	});

	it('«жіночі» двічі не пишемо', () => {
		expect(categoryHeading('Жіночі сукні')).toBe('Жіночі сукні');
	});

	it('вступ бере ціни й кількість з каталогу, а не вигадує', () => {
		const text = categoryIntro('Пальто', 5, { min: 189_900, max: 349_900 });

		expect(text).toContain('Жіночі пальто');
		expect(text).toContain('5 моделей у наявності');
		expect(text).toContain('від 1\u00a0899\u00a0грн до 3\u00a0499\u00a0грн');
		expect(text).toContain(`${RETURN_DAYS} днів`);
	});

	it('одна ціна на всю категорію — без «від і до»', () => {
		expect(categoryIntro('Костюми', 1, { min: 259_900, max: 259_900 })).toContain(
			'1 модель у наявності, ціна 2\u00a0599\u00a0грн'
		);
	});

	it('опис для видачі вміщується в те, що Google показує без обрізання', () => {
		const text = categoryDescription('Демісезонні куртки', 10, { min: 189_900, max: 349_900 });

		expect(text.length).toBeLessThanOrEqual(160);
		expect(text).toContain('10 моделей');
	});
});

describe('тексти колекції', () => {
	const shelves = ['Демісезонні куртки', 'Пальто', 'Бомбери', 'Вітровки'];
	const range = { min: 138_000, max: 450_000 };

	it('вступ називає склад — у запиті «осінній верхній одяг» слова «колекція» немає', () => {
		const text = collectionIntro('Осіння колекція', 24, range, shelves);

		expect(text).toContain('24 моделі у наявності');
		expect(text).toContain(`від ${formatPrice(138_000)} до ${formatPrice(450_000)}`);
		expect(text).toContain('демісезонні куртки, пальто, бомбери, вітровки');
		expect(text).toContain(`${RETURN_DAYS} днів`);
	});

	it('заголовок у видачі — лише три перші полиці', () => {
		expect(collectionTitle('Осіння колекція', shelves)).toBe(
			'Осіння колекція жіночого одягу — демісезонні куртки, пальто, бомбери | LILY LOOK'
		);
	});

	it('опис вміщується в те, що Google показує без обрізання', () => {
		const text = collectionDescription('Осіння колекція', 24, range, shelves);

		expect(text.length).toBeLessThanOrEqual(160);
	});

	it('діапазон цін — з карток, які стоять на сторінці', () => {
		const card = (price: number): ProductCard => ({
			id: String(price),
			slug: 'kurtka',
			name: 'Куртка',
			price,
			compareAt: null,
			image: null,
			hoverImage: null,
			colors: [],
			inStock: true
		});

		expect(priceRangeOf([card(250_000), card(138_000)])).toEqual({ min: 138_000, max: 250_000 });
		expect(priceRangeOf([])).toBeNull();
	});
});

describe('невидимі розриви рядка', () => {
	/**
	 * U+2028 і U+2029 у старих рушіях закінчують рядок посеред JSON. Назва,
	 * скопійована з Word, приносить їх легко — тож у виході лишається тільки
	 * текстова послідовність.
	 */
	it('не потрапляють у HTML як є', () => {
		const script = serializeJsonLd([
			productNode(ORIGIN, { ...product, name: 'Сукня\u2028Olivia\u2029' })
		]);

		expect(script).not.toMatch(/[\u2028\u2029]/);
		expect(script).toContain('\\u2028');
		expect(parse(script)['@graph'][0].name).toBe('Сукня\u2028Olivia\u2029');
	});
});
