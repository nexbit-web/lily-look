import { RETURN_DAYS } from '$lib/config';
import type { ProductDetail } from '$lib/types';
import { describe, expect, it } from 'vitest';
import {
	breadcrumbsNode,
	itemListNode,
	productNode,
	serializeJsonLd,
	storeNode,
	websiteNode
} from './seo';

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
	images: [{ url: 'https://cdn.test/1.jpg', alt: 'фото' }],
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
			stock: 3
		},
		{
			id: 'v2',
			sku: 'OLIVIA-M-CHORNYI',
			size: 'M',
			color: 'Чорний',
			colorHex: '#000',
			price: 219_900,
			stock: 0
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
			images: [{ url: '/uploads/1.jpg', alt: '' }]
		}) as Record<string, unknown>;

		expect(node.url).toBe(`${ORIGIN}/product/suknia-olivia`);
		expect(node.image).toEqual([`${ORIGIN}/uploads/1.jpg`]);
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
