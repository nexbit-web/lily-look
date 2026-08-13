import { describe, expect, it } from 'vitest';
import { discountPercent, formatPrice } from './money';

/**
 * Гроші — цілі копійки. Головне, що тут перевіряється: жодних плаваючих
 * похибок і жодного форматування повз цей модуль.
 */

/** Intl розділяє тисячі нерозривним пробілом — прибираємо будь-які пробіли. */
const digits = (value: string) => value.replace(/[^0-9]/g, '');

describe('formatPrice', () => {
	it('показує гривні без копійок', () => {
		expect(digits(formatPrice(129900))).toMatch(/^1299/);
		expect(digits(formatPrice(0))).toMatch(/^0/);
	});

	it('округлює копійки, а не обрізає', () => {
		expect(digits(formatPrice(99950))).toMatch(/^1000/);
	});

	it('не втрачає точності на великих сумах', () => {
		expect(digits(formatPrice(99_999_900))).toMatch(/^999999/);
	});
});

describe('discountPercent', () => {
	it('рахує знижку від старої ціни', () => {
		expect(discountPercent(80000, 100000)).toBe(20);
		expect(discountPercent(66600, 99900)).toBe(33);
	});

	it('мовчить, якщо знижки немає', () => {
		expect(discountPercent(100000, null)).toBeNull();
		expect(discountPercent(100000, 100000)).toBeNull();
		expect(discountPercent(100000, 90000)).toBeNull();
		expect(discountPercent(100000, 0)).toBeNull();
	});
});
