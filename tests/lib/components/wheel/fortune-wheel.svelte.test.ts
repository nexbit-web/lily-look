import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FortuneWheel from '$lib/components/wheel/fortune-wheel.svelte';

/**
 * Колесо до оберту. Сам оберт (фізика гальмування) перевіряє
 * `wheel-spin.test.ts`, а приз вибирає сервер (`server/wheel.test.ts`);
 * тут — що покупець бачить і з чого колесо починає.
 */

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

const disc = () => document.querySelector<HTMLElement>('[data-slot="wheel-disc"]')!;

describe('колесо фортуни', () => {
	it('шість секторів із призами й «Ще раз»', () => {
		render(FortuneWheel);

		for (const label of ['−5%', '−10%', '−3%', 'Доставка', '−7%', 'Ще']) {
			expect(disc()).toHaveTextContent(label);
		}
		expect(screen.getByRole('img')).toHaveAccessibleName(/Колесо з призами: Знижка 5%/);
	});

	it('стрілка спершу дивиться в середину першого сектора, а не на стик', () => {
		render(FortuneWheel);

		// Шість секторів по 60°: середина першого — 30°, диск повернутий на −30°.
		expect(disc().style.getPropertyValue('--rot')).toBe('330deg');
	});

	it('написи повертаються назад на кут диска — стоять рівно', () => {
		render(FortuneWheel);

		const labels = disc().querySelectorAll<HTMLElement>(':scope > span');
		expect(labels).toHaveLength(6);
		for (const label of labels) {
			expect(label.style.transform).toContain('rotate(calc(-1 * var(--rot)))');
		}
	});

	it('кнопка кличе крутити', () => {
		render(FortuneWheel);

		expect(screen.getByRole('button', { name: 'Крутити колесо' })).toBeEnabled();
	});

	it('приз уже виграно — колесо стоїть на ньому, крутити не можна', () => {
		render(FortuneWheel, {
			won: {
				code: 'off10',
				label: 'Знижка 10%',
				percent: 10,
				freeDelivery: false,
				expiresAt: '2026-10-02T10:00:00Z'
			}
		});

		// −10% — другий сектор, середина 90°.
		expect(disc().style.getPropertyValue('--rot')).toBe('270deg');
		expect(screen.getByRole('button', { name: 'Вітаємо!' })).toBeDisabled();
	});
});
