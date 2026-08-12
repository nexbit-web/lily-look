/**
 * Гроші всюди в проєкті — цілі числа в копійках.
 * Форматування живе тільки тут, щоб ціна виглядала однаково скрізь.
 */

const formatter = new Intl.NumberFormat('uk-UA', {
	style: 'currency',
	currency: 'UAH',
	maximumFractionDigits: 0
});

/** 129900 → "1 299 ₴" */
export function formatPrice(kopiyky: number): string {
	return formatter.format(kopiyky / 100);
}

/** Знижка у відсотках, або null якщо старої ціни немає. */
export function discountPercent(price: number, compareAt: number | null): number | null {
	if (!compareAt || compareAt <= price) return null;
	return Math.round((1 - price / compareAt) * 100);
}
