/**
 * Гроші всюди в проєкті — цілі числа в копійках.
 * Форматування живе тільки тут, щоб ціна виглядала однаково скрізь.
 */

/**
 * Форматуємо тільки число, а валюту дописуємо самі: `style: 'currency'` дає
 * різний знак у різних середовищах (Node — «₴», Chrome — «грн»), і після
 * гідратації ціна стрибала б у покупця на очах.
 */
const formatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });

/** 129900 → "1 299 грн". Пробіл перед гривнею нерозривний. */
export function formatPrice(kopiyky: number): string {
	return `${formatter.format(kopiyky / 100)}\u00a0грн`;
}

/**
 * 264900 → "2649.00" — ціна для машин: Schema.org, фід Merchant Center,
 * Open Graph. Крапка й рівно дві цифри копійок, без пробілів і валюти.
 */
export function priceAmount(kopiyky: number): string {
	return (kopiyky / 100).toFixed(2);
}

/** 264900 → 2649 — ціна числом для API, що чекають саме число (Meta Conversions API). */
export function priceValue(kopiyky: number): number {
	return kopiyky / 100;
}

/**
 * Знижка у відсотках до двох знаків після коми, або null, якщо старої ціни
 * немає.
 *
 * Не ціле: CRM задає й дробові знижки (33.6 %, 12.25 %), і округлення
 * показало б покупцеві «−34 %» — більше, ніж є насправді. Цілі знижки так
 * і лишаються цілими: копійки округлення ціни на соті не впливають.
 */
export function discountPercent(price: number, compareAt: number | null): number | null {
	if (!compareAt || compareAt <= price) return null;
	const percent = Math.round((1 - price / compareAt) * 10_000) / 100;
	return percent > 0 ? percent : null;
}

const percentFormatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });

/** 33.6 → «33,6», 12.25 → «12,25», 20 → «20» — з комою, без зайвих нулів. */
export function formatPercent(value: number): string {
	return percentFormatter.format(value);
}
