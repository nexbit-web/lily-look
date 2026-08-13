import { describe, expect, it } from 'vitest';
import { plural } from './plural';

describe('plural', () => {
	const form = (value: number) => plural(value, 'товар', 'товари', 'товарів');

	it('обирає форму за останньою цифрою', () => {
		expect(form(1)).toBe('товар');
		expect(form(2)).toBe('товари');
		expect(form(4)).toBe('товари');
		expect(form(5)).toBe('товарів');
		expect(form(9)).toBe('товарів');
		expect(form(0)).toBe('товарів');
	});

	it('знає про виняток 11–14', () => {
		expect(form(11)).toBe('товарів');
		expect(form(12)).toBe('товарів');
		expect(form(14)).toBe('товарів');
		expect(form(111)).toBe('товарів');
	});

	it('працює на десятках і сотнях', () => {
		expect(form(21)).toBe('товар');
		expect(form(22)).toBe('товари');
		expect(form(25)).toBe('товарів');
		expect(form(101)).toBe('товар');
		expect(form(104)).toBe('товари');
	});
});
