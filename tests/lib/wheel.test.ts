import { WHEEL_PRIZES } from '$lib/config';
import { WHEEL_SECTORS, isRetry, prizeAt, prizeByCode, prizeDiscount } from '$lib/wheel';
import { describe, expect, it } from 'vitest';

describe('знижка приза', () => {
	it('відсоток від суми товарів, округлений до гривні', () => {
		// 7% від 2 870 грн — 200,9 → 201 грн
		expect(prizeDiscount({ percent: 7 }, 287_000)).toBe(20_100);
		// 10% від 3 500 грн — рівно 350 грн
		expect(prizeDiscount({ percent: 10 }, 350_000)).toBe(35_000);
	});

	it('доставка, «Ще спроба», порожній кошик чи відсутній приз — нуль', () => {
		expect(prizeDiscount({ percent: 0 }, 287_000)).toBe(0);
		expect(prizeDiscount({ percent: 7 }, 0)).toBe(0);
		expect(prizeDiscount(null, 287_000)).toBe(0);
	});
});

describe('призи колеса', () => {
	it('шість секторів: чотири знижки, безкоштовна доставка й «Ще спроба»', () => {
		expect(WHEEL_PRIZES).toHaveLength(6);
		expect(WHEEL_PRIZES.filter((prize) => prize.freeDelivery)).toHaveLength(1);
		expect(WHEEL_PRIZES.filter((prize) => isRetry(prize))).toHaveLength(1);
		expect(
			WHEEL_PRIZES.filter((prize) => prize.percent > 0)
				.map((prize) => prize.percent)
				.sort((a, b) => a - b)
		).toEqual([3, 5, 7, 10]);
	});

	it('знижки не більші за 10%', () => {
		expect(Math.max(...WHEEL_PRIZES.map((prize) => prize.percent))).toBeLessThanOrEqual(10);
	});

	it('коди унікальні — інакше колесо зупинилось би не на тому секторі', () => {
		const codes = WHEEL_PRIZES.map((prize) => prize.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('«Ще спроба» — не приз: ні знижки, ні доставки', () => {
		const retry = prizeByCode('retry')!;
		expect(isRetry(retry)).toBe(true);
		expect(retry.percent).toBe(0);
		expect(retry.freeDelivery).toBe(false);
		expect(isRetry(prizeByCode('delivery')!)).toBe(false);
	});
});

describe('сектори й шанси', () => {
	const width = (code: string) => {
		const sector = WHEEL_SECTORS.find((item) => item.code === code)!;
		return sector.to - sector.from;
	};

	it('сектори без проміжків закривають усе коло', () => {
		expect(WHEEL_SECTORS[0].from).toBe(0);
		expect(WHEEL_SECTORS.at(-1)!.to).toBeCloseTo(360);
		for (let index = 1; index < WHEEL_SECTORS.length; index++) {
			expect(WHEEL_SECTORS[index].from).toBeCloseTo(WHEEL_SECTORS[index - 1].to);
		}
	});

	it('усі сектори однакові — колесо симетричне', () => {
		for (const sector of WHEEL_SECTORS) expect(width(sector.code)).toBeCloseTo(60);
	});

	it('шанс приза — його вага, а не ширина сектора', () => {
		const total = WHEEL_PRIZES.reduce((sum, prize) => sum + prize.weight, 0);
		const counts: Record<string, number> = {};
		const steps = 36_000;
		for (let step = 0; step < steps; step++) {
			const code = prizeAt(step / steps).code;
			counts[code] = (counts[code] ?? 0) + 1;
		}
		for (const prize of WHEEL_PRIZES) {
			expect(counts[prize.code] / steps).toBeCloseTo(prize.weight / total, 3);
		}
	});

	it('«Ще спроба» випадає рідше за будь-який приз', () => {
		const retry = prizeByCode('retry')!;
		for (const prize of WHEEL_PRIZES.filter((item) => !isRetry(item))) {
			expect(retry.weight).toBeLessThan(prize.weight);
		}
	});

	it('крайні значення не виходять за колесо', () => {
		expect(prizeAt(0).code).toBe(WHEEL_PRIZES[0].code);
		expect(prizeAt(0.9999999).code).toBe(WHEEL_PRIZES.at(-1)!.code);
	});
});
