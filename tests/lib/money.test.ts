import { describe, expect, it } from 'vitest';
import {
	discountPercent,
	formatAmount,
	formatPercent,
	formatPrice,
	priceAmount,
	priceValue
} from '$lib/money';

/**
 * Гроші — цілі копійки. Головне, що тут перевіряється: жодних плаваючих
 * похибок і жодного форматування повз цей модуль.
 */

/** Intl розділяє тисячі нерозривним пробілом — прибираємо будь-які пробіли. */
const digits = (value: string) => value.replace(/[^0-9]/g, '');

describe('formatAmount', () => {
	it('те саме число, що й у formatPrice, але без валюти', () => {
		expect(digits(formatAmount(129900))).toBe('1299');
		expect(formatPrice(129900).startsWith(formatAmount(129900))).toBe(true);
		expect(formatAmount(129900)).not.toContain('грн');
	});
});

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

	it('валюта дописана вручну — Node і браузер мають друкувати однаково', () => {
		// style: 'currency' дає «₴» в Node і «грн» у Chrome, і ціна стрибала б
		// після гідратації. Формат тут зафіксований навмисно.
		expect(formatPrice(129900)).toMatch(/грн$/);
	});
});

describe('discountPercent', () => {
	it('рахує знижку від старої ціни', () => {
		expect(discountPercent(80000, 100000)).toBe(20);
		expect(discountPercent(66600, 99900)).toBe(33.33);
	});

	it('дробова знижка з CRM — як задана, а не округлена вгору', () => {
		// 33.6 % від 2 990 грн: база рахує ROUND(299000 * 33.6 / 100) = 100464
		expect(discountPercent(299_000 - 100_464, 299_000)).toBe(33.6);
		// 12.25 % від 3 480 грн: ROUND(348000 * 12.25 / 100) = 42630
		expect(discountPercent(348_000 - 42_630, 348_000)).toBe(12.25);
	});

	it('ціла знижка лишається цілою, хоч ціна й округлена до копійки', () => {
		// 20 % від 999,99 грн: знижка 200,00 грн (округлено з 199,998)
		expect(discountPercent(99_999 - 20_000, 99_999)).toBe(20);
	});

	it('мовчить, якщо знижки немає', () => {
		expect(discountPercent(100000, null)).toBeNull();
		expect(discountPercent(100000, 100000)).toBeNull();
		expect(discountPercent(100000, 90000)).toBeNull();
		expect(discountPercent(100000, 0)).toBeNull();
		// Різниця в копійку на великій ціні — це не знижка, а «−0 %».
		expect(discountPercent(999_999, 1_000_000)).toBeNull();
	});
});

describe('formatPercent', () => {
	it('з комою, без зайвих нулів', () => {
		expect(formatPercent(33.6)).toBe('33,6');
		expect(formatPercent(12.25)).toBe('12,25');
		expect(formatPercent(20)).toBe('20');
	});
});

describe('priceAmount', () => {
	it('ціна для Schema.org і Merchant Center: крапка й рівно дві цифри копійок', () => {
		expect(priceAmount(264900)).toBe('2649.00');
		expect(priceAmount(105)).toBe('1.05');
		expect(priceAmount(0)).toBe('0.00');
	});
});

describe('priceValue', () => {
	it('ціна числом для Meta: гривні з копійками, без округлення', () => {
		expect(priceValue(264900)).toBe(2649);
		expect(priceValue(105)).toBe(1.05);
		expect(priceValue(0)).toBe(0);
	});
});
