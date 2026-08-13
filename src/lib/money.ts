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

/** Знижка у відсотках, або null якщо старої ціни немає. */
export function discountPercent(price: number, compareAt: number | null): number | null {
	if (!compareAt || compareAt <= price) return null;
	return Math.round((1 - price / compareAt) * 100);
}
