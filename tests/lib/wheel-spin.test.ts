import {
	BRAKE_MS,
	SPIN_UP_MS,
	TOP_SPEED,
	brakeAngle,
	planBrake,
	pointerAt,
	spinUpAngle
} from '$lib/wheel-spin';
import { describe, expect, it } from 'vitest';

/**
 * Фізика оберту: колесо має зупинитись рівно на виграному секторі й не
 * смикнутись, переходячи від обертання до гальмування.
 */

describe('розгін', () => {
	it('стартує з місця й виходить на рівну швидкість', () => {
		expect(spinUpAngle(0)).toBe(0);
		const second = spinUpAngle(SPIN_UP_MS + 1000) - spinUpAngle(SPIN_UP_MS);
		expect(second).toBeCloseTo(TOP_SPEED);
	});
});

describe('гальмування', () => {
	it('зупиняється рівно на потрібній точці колеса — з будь-якого кута', () => {
		for (const from of [0, 123.4, 1080.5, 7777]) {
			for (const target of [0, 15, 90, 200.5, 359]) {
				const brake = planBrake(from, target);
				const end = brakeAngle(brake, brake.durationMs);
				expect(pointerAt(end)).toBeCloseTo(target, 6);
			}
		}
	});

	it('гальмує кілька обертів, а не зупиняється одразу', () => {
		const brake = planBrake(0, 90);
		expect(brake.distance).toBeGreaterThan(3 * 360);
		expect(brake.durationMs).toBeGreaterThanOrEqual(BRAKE_MS);
		expect(brake.durationMs).toBeLessThan(BRAKE_MS + 1500);
	});

	it('швидкість на початку гальмування така сама, як при обертанні — без ривка', () => {
		const brake = planBrake(500, 42);
		const step = 1;
		const speedPerSecond = ((brakeAngle(brake, step) - brakeAngle(brake, 0)) / step) * 1000;
		expect(speedPerSecond).toBeCloseTo(TOP_SPEED, -1);
	});

	it('до кінця лише сповільнюється — колесо не крутиться назад', () => {
		const brake = planBrake(0, 250);
		let previous = -Infinity;
		for (let ms = 0; ms <= brake.durationMs; ms += 50) {
			const angle = brakeAngle(brake, ms);
			expect(angle).toBeGreaterThanOrEqual(previous);
			previous = angle;
		}
	});
});
