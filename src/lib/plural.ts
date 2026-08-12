/**
 * Українські форми множини: 1 товар, 2 товари, 5 товарів.
 *
 * Intl.PluralRules теж уміє це рахувати, але однаково потребує трьох форм
 * від нас — тож простіше й дешевше порахувати правило руками.
 */
export function plural(value: number, one: string, few: string, many: string): string {
	const tens = Math.abs(value) % 100;
	if (tens > 10 && tens < 20) return many;

	const ones = tens % 10;
	if (ones === 1) return one;
	if (ones >= 2 && ones <= 4) return few;
	return many;
}
