import { createHash } from 'node:crypto';
import { RETURN_DAYS, SITE } from '$lib/config';
import { portableImageSrc } from '$lib/image';
import { formatPrice } from '$lib/money';
import { plural } from '$lib/plural';
import { framesForColor } from '$lib/product-images';
import { daysLabel, deliveryTerms, FACTS } from '$lib/store-facts';
import type { CategoryLink } from '$lib/types';
import type { FeedProduct } from './catalog.js';

/**
 * Каталог для чужих систем: Google Merchant Center і ІІ-асистентів.
 *
 * Обидва формати збираються тут із тих самих даних і тими самими
 * правилами, що й сторінки сайту: ціна до сплати, лише те, що можна
 * купити, фото того кольору, про який іде мова. Розійтись із сайтом фід
 * не має права — за невідповідність ціни у фіді й на сторінці Merchant
 * Center блокує товари.
 */

/** Копійки → «2199.00 UAH», як того вимагає Merchant Center. */
function feedPrice(kopiyky: number): string {
	return `${(kopiyky / 100).toFixed(2)} UAH`;
}

function xml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function absolute(origin: string, path: string): string {
	return new URL(path, origin).href;
}

/**
 * Категорія Google для одягу («Одяг та аксесуари > Одяг»). Числовий код
 * не залежить від мови акаунта, на відміну від текстової назви.
 */
const GOOGLE_CATEGORY_CLOTHING = '1604';

/** Скільки додаткових фото приймає Merchant Center на позицію. */
const EXTRA_IMAGES = 10;

/**
 * Найдовший `id`, який Merchant Center приймає без попередження. Рахує він
 * байти UTF-8, а не літери: артикул на 40 знаків, де половина кирилицею,
 * для нього вже задовгий.
 */
const MERCHANT_ID_BYTES = 50;
const MERCHANT_ID_HASH = 8;

/**
 * `id` позиції у фіді — артикул варіанта, як радить Google.
 *
 * Артикули CRM складає з назви й кольору, тож довгі виходять за ліміт:
 * `dvokolirna-demisezonna-kurtka-oversaiz-xxl-temnyi-khaki-z-olyvkovym` —
 * 67 байт. Просто обрізати не можна: у двох розмірів однієї моделі
 * початок спільний, і різниця могла б лишитись у відрізаному хвості.
 * Тому довгий артикул скорочуємо до впізнаваного початку й дописуємо хеш
 * повного артикула. Хеш той самий щодня — для Google це той самий товар
 * зі своєю історією, а не новий.
 */
export function merchantId(sku: string): string {
	if (Buffer.byteLength(sku) <= MERCHANT_ID_BYTES) return sku;

	const budget = MERCHANT_ID_BYTES - MERCHANT_ID_HASH - 1;
	let prefix = '';
	let bytes = 0;
	// По символах, а не по байтах: інакше кирилична літера розрізалась би навпіл.
	for (const char of sku) {
		bytes += Buffer.byteLength(char);
		if (bytes > budget) break;
		prefix += char;
	}

	const hash = createHash('sha256').update(sku).digest('hex').slice(0, MERCHANT_ID_HASH);
	return `${prefix.replace(/-+$/, '')}-${hash}`;
}

/**
 * Одна позиція фіду — один варіант (колір + розмір).
 *
 * Так хоче Merchant Center для одягу: кожен розмір — окремий товар зі
 * своїм артикулом і наявністю, а `item_group_id` зводить їх назад в одну
 * модель. Фото беруться того кольору, який продається в цій позиції, —
 * інакше в Google Покупках біла куртка стояла б із чорним фото.
 */
function merchantItem(
	origin: string,
	product: FeedProduct,
	variant: FeedProduct['variants'][number]
) {
	const frames = framesForColor(product.images, variant.color);
	const [cover, ...rest] = frames.map((image) => absolute(origin, portableImageSrc(image.url)));
	const link = absolute(origin, `/product/${product.slug}`);

	// Знижка лише там, де її видно на сайті: варіант зі своєю ціною стару
	// ціну товару не успадковує — так само, як і в розмітці сторінки.
	const onSale = product.compareAt !== null && variant.price === product.price;

	const fields: [string, string | undefined][] = [
		['g:id', merchantId(variant.sku)],
		['g:item_group_id', product.slug],
		['g:title', `${product.name} — ${variant.color}, розмір ${variant.size}`],
		['g:description', product.description],
		['g:link', link],
		['g:image_link', cover],
		['g:availability', 'in_stock'],
		['g:price', feedPrice(onSale ? (product.compareAt as number) : variant.price)],
		['g:sale_price', onSale ? feedPrice(variant.price) : undefined],
		['g:brand', SITE.name],
		['g:condition', 'new'],
		// Штрихкодів (GTIN) у власного бренду немає — так і кажемо, інакше
		// Merchant Center вимагатиме їх і не пропустить позицію.
		['g:identifier_exists', 'no'],
		['g:google_product_category', GOOGLE_CATEGORY_CLOTHING],
		['g:product_type', `Жіночий одяг > ${product.category.name}`],
		['g:gender', 'female'],
		['g:age_group', 'adult'],
		['g:color', variant.color],
		['g:size', variant.size]
	];

	const lines = fields
		.filter((field): field is [string, string] => field[1] !== undefined && field[1] !== '')
		.map(([tag, value]) => `\t\t\t<${tag}>${xml(value)}</${tag}>`);

	for (const image of rest.slice(0, EXTRA_IMAGES)) {
		lines.push(`\t\t\t<g:additional_image_link>${xml(image)}</g:additional_image_link>`);
	}

	return `\t\t<item>\n${lines.join('\n')}\n\t\t</item>`;
}

/**
 * Фід для Google Merchant Center у форматі RSS 2.0.
 *
 * Той самий файл приймає й каталог Meta (Facebook та Instagram), тож
 * окремий фід для них не потрібен.
 */
export function merchantFeed(origin: string, products: FeedProduct[]): string {
	const items = products
		// Товар без фото Merchant Center відхиляє — нема що й надсилати.
		.filter((product) => product.images.length > 0)
		.flatMap((product) =>
			product.variants.map((variant) => merchantItem(origin, product, variant))
		);

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
		'\t<channel>',
		`\t\t<title>${xml(SITE.name)}</title>`,
		`\t\t<link>${xml(`${origin}/`)}</link>`,
		`\t\t<description>${xml(SITE.description)}</description>`,
		...items,
		'\t</channel>',
		'</rss>',
		''
	].join('\n');
}

// ─── llms.txt ───────────────────────────────────────────────────────────

/** «від 1 899 до 3 499 грн» або «2 599 грн», якщо ціна одна. */
function priceRange(prices: number[]): string {
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	return min === max ? formatPrice(min) : `від ${formatPrice(min)} до ${formatPrice(max)}`;
}

function productLine(origin: string, product: FeedProduct): string {
	const price = product.compareAt
		? `${formatPrice(product.price)} (замість ${formatPrice(product.compareAt)})`
		: formatPrice(product.price);
	const sizes = [...new Set(product.variants.map((variant) => variant.size))];
	const colors = [...new Set(product.variants.map((variant) => variant.color))];
	const colorLabel = plural(colors.length, 'колір', 'кольори', 'кольорів');

	return `- [${product.name}](${absolute(origin, `/product/${product.slug}`)}): ${price}; розміри ${sizes.join(', ')}; ${colorLabel}: ${colors.join(', ')}`;
}

/**
 * llms.txt — довідка про магазин для ІІ-асистентів (формат llmstxt.org).
 *
 * Коли ChatGPT, Gemini чи Perplexity питають «де купити жіноче пальто в
 * Україні», вони шукають сторінку, з якої можна швидко взяти факти:
 * що продається, почім, як доставляють і повертають. Тут усе це одним
 * коротким Markdown-файлом, без меню, скриптів і верстки, — і з
 * посиланнями, щоб асистент вів покупця на потрібну сторінку.
 *
 * Лише факти з бази й налаштувань: те, що асистент прочитає тут, він
 * перекаже покупцеві як правду.
 */
export function llmsTxt(
	origin: string,
	products: FeedProduct[],
	categories: CategoryLink[]
): string {
	const byCategory = new Map<string, number[]>();
	for (const product of products) {
		const prices = byCategory.get(product.category.slug) ?? [];
		prices.push(product.price);
		byCategory.set(product.category.slug, prices);
	}

	const shelves = categories
		.filter((category) => byCategory.has(category.slug))
		.map((category) => {
			const prices = byCategory.get(category.slug) as number[];
			const count = `${prices.length} ${plural(prices.length, 'модель', 'моделі', 'моделей')}`;
			return `- [${category.name}](${absolute(origin, `/catalog/${category.slug}`)}): ${count}, ${priceRange(prices)}`;
		});

	const delivery = deliveryTerms().map((term) => `  - ${term.label}: ${term.price}, ${term.time}`);
	const onSale = products.filter((product) => product.compareAt !== null).length;

	return [
		`# ${SITE.name}`,
		'',
		`> ${SITE.name} — український інтернет-магазин жіночого одягу. Доставка по всій Україні, оплата при отриманні.`,
		'',
		`Сайт: ${origin}/. Мова сайту — українська, ціни в гривнях. Зараз у наявності ${products.length} ${plural(products.length, 'модель', 'моделі', 'моделей')}${onSale ? `, з них ${onSale} зі знижкою` : ''}; повний і завжди актуальний перелік — у каталозі на сайті.`,
		'',
		'## Умови',
		'',
		`- [Доставка і оплата](${absolute(origin, '/delivery')}): ${FACTS.dispatch} ${FACTS.freeDelivery}`,
		...delivery,
		`- ${FACTS.payment}`,
		`- [Обмін і повернення](${absolute(origin, '/returns')}): ${daysLabel(RETURN_DAYS)} з дня отримання.`,
		`- [Контакти](${absolute(origin, '/contacts')}): телефон ${SITE.phone}, пошта ${SITE.email}. ${FACTS.pickup}`,
		'',
		'## Категорії',
		'',
		...shelves,
		'',
		'## Товари в наявності',
		'',
		...products.map((product) => productLine(origin, product)),
		'',
		'## Для покупця',
		'',
		'- На сторінці кожного товару — точна дата отримання для кожного способу доставки, склад тканини й таблиця розмірів, якщо її заповнено.',
		'- Розпродані моделі зникають із сайту автоматично: усе, що є в каталозі, можна замовити.',
		''
	].join('\n');
}
