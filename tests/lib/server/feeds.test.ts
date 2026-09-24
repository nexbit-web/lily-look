import { describe, expect, it } from 'vitest';
import type { FeedProduct } from '$lib/server/catalog';
import { llmsTxt, merchantFeed } from '$lib/server/feeds';

/**
 * Фіди для Google Merchant Center і ІІ-асистентів.
 *
 * Помилку тут не видно на сайті, але за неї платять товари: Merchant Center
 * блокує позицію, чия ціна не збігається зі сторінкою, а асистент упевнено
 * перекаже покупцеві стару ціну. Тому перевіряємо саме відповідність сайту.
 */

const ORIGIN = 'https://lilylook.store';

const coat: FeedProduct = {
	slug: 'palto-nord',
	name: 'Пальто Nord',
	description: 'Вовна й кашемір.',
	category: { slug: 'palto', name: 'Пальто' },
	price: 219_900,
	compareAt: 299_900,
	images: [
		{ url: 'https://cdn.test/chornyi.jpg', color: 'Чорний' },
		{ url: 'https://cdn.test/bilyi.jpg', color: 'Білий' },
		{ url: 'https://cdn.test/tkanyna.jpg', color: null }
	],
	variants: [
		{ sku: 'NORD-S-CH', size: 'S', color: 'Чорний', price: 219_900 },
		{ sku: 'NORD-M-BI', size: 'M', color: 'Білий', price: 219_900 }
	]
};

/** Позиції фіду як рядки між <item> і </item>. */
function items(feed: string): string[] {
	return [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
}

function field(item: string, tag: string): string | null {
	return item.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? null;
}

describe('фід Google Merchant', () => {
	it('кожен розмір і колір — окрема позиція, зведена в одну модель', () => {
		const [black, white] = items(merchantFeed(ORIGIN, [coat]));

		expect(field(black, 'g:id')).toBe('NORD-S-CH');
		expect(field(white, 'g:id')).toBe('NORD-M-BI');
		expect(field(black, 'g:item_group_id')).toBe('palto-nord');
		expect(field(white, 'g:item_group_id')).toBe('palto-nord');
		expect(field(black, 'g:size')).toBe('S');
		expect(field(white, 'g:color')).toBe('Білий');
	});

	/** Біла позиція з чорним фото в Google Покупках — це повернення. */
	it('фото позиції — того кольору, що продається', () => {
		const [black, white] = items(merchantFeed(ORIGIN, [coat]));

		expect(field(black, 'g:image_link')).toContain('chornyi.jpg');
		expect(field(white, 'g:image_link')).toContain('bilyi.jpg');
		// Спільний кадр (тканина) доречний до будь-якого кольору.
		expect(white).toContain('tkanyna.jpg');
		expect(white).not.toContain('chornyi.jpg');
	});

	it('знижка: звичайна ціна — стара, ціна продажу — та, що на сайті', () => {
		const [item] = items(merchantFeed(ORIGIN, [coat]));

		expect(field(item, 'g:price')).toBe('2999.00 UAH');
		expect(field(item, 'g:sale_price')).toBe('2199.00 UAH');
	});

	it('без знижки ціна продажу не вигадується', () => {
		const [item] = items(merchantFeed(ORIGIN, [{ ...coat, compareAt: null }]));

		expect(field(item, 'g:price')).toBe('2199.00 UAH');
		expect(item).not.toContain('g:sale_price');
	});

	it('варіант із власною ціною знижки товару не отримує', () => {
		const [own] = items(
			merchantFeed(ORIGIN, [{ ...coat, variants: [{ ...coat.variants[0], price: 250_000 }] }])
		);

		expect(field(own, 'g:price')).toBe('2500.00 UAH');
		expect(own).not.toContain('g:sale_price');
	});

	it('одяг: жіночий, дорослий, без штрихкоду — інакше Merchant Center не пропустить', () => {
		const [item] = items(merchantFeed(ORIGIN, [coat]));

		expect(field(item, 'g:gender')).toBe('female');
		expect(field(item, 'g:age_group')).toBe('adult');
		expect(field(item, 'g:identifier_exists')).toBe('no');
		expect(field(item, 'g:link')).toBe(`${ORIGIN}/product/palto-nord`);
	});

	it('амперсанд у назві не ламає XML', () => {
		const feed = merchantFeed(ORIGIN, [{ ...coat, name: 'Пальто Black & White <new>' }]);

		expect(feed).toContain('Пальто Black &amp; White &lt;new&gt;');
		expect(feed).not.toContain('Black & White');
	});

	it('товар без жодного фото у фід не йде', () => {
		expect(items(merchantFeed(ORIGIN, [{ ...coat, images: [] }]))).toHaveLength(0);
	});
});

describe('llms.txt', () => {
	const categories = [
		{ slug: 'palto', name: 'Пальто', productCount: 2 },
		{ slug: 'sukni', name: 'Сукні', productCount: 0 }
	];

	const second: FeedProduct = {
		...coat,
		slug: 'palto-rose',
		name: 'Пальто Rose',
		price: 349_900,
		compareAt: null
	};

	it('категорія — з кількістю й діапазоном цін, узятим із товарів', () => {
		const text = llmsTxt(ORIGIN, [coat, second], categories);

		expect(text).toContain(
			`- [Пальто](${ORIGIN}/catalog/palto): 2 моделі, від 2\u00a0199\u00a0грн до 3\u00a0499\u00a0грн`
		);
	});

	it('порожньої категорії асистент не побачить', () => {
		expect(llmsTxt(ORIGIN, [coat], categories)).not.toContain('Сукні');
	});

	it('товар — з ціною, старою ціною, розмірами й кольорами', () => {
		const text = llmsTxt(ORIGIN, [coat], categories);

		expect(text).toContain(`[Пальто Nord](${ORIGIN}/product/palto-nord)`);
		expect(text).toContain('2 199 грн (замість 2 999 грн)');
		expect(text).toContain('розміри S, M');
		expect(text).toContain('кольори: Чорний, Білий');
	});

	it('умови доставки й повернення — з посиланнями на сторінки', () => {
		const text = llmsTxt(ORIGIN, [coat], categories);

		expect(text).toContain(`${ORIGIN}/delivery`);
		expect(text).toContain(`${ORIGIN}/returns`);
		expect(text).toContain(`${ORIGIN}/contacts`);
		expect(text).toContain('Нова Пошта — відділення');
	});

	it('починається із заголовка й короткого опису, як велить формат', () => {
		const [title, , summary] = llmsTxt(ORIGIN, [coat], categories).split('\n');

		expect(title).toBe('# LILY LOOK');
		expect(summary.startsWith('> ')).toBe(true);
	});
});
