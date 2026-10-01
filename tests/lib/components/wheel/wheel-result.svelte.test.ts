import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WheelResult from '$lib/components/wheel/wheel-result.svelte';

/** Вікно з виграним призом: коротко, що виграно, скільки діє, — і свято. */

const { confetti } = vi.hoisted(() => ({ confetti: vi.fn() }));
vi.mock('canvas-confetti', () => ({ default: confetti }));

const prize = (percent: number, freeDelivery = false) => ({
	code: freeDelivery ? 'delivery' : `off${percent}`,
	label: freeDelivery ? 'Безкоштовна доставка' : `Знижка ${percent}%`,
	percent,
	freeDelivery,
	expiresAt: '2026-10-02T10:00:00Z'
});

const result = () => document.querySelector('[data-slot="wheel-result"]');

beforeEach(() => {
	confetti.mockClear();
});

describe('виграний приз', () => {
	it('знижка — великим числом, на що діє і скільки', () => {
		render(WheelResult, { prize: prize(10) });

		expect(result()).toHaveTextContent('−10%');
		expect(result()).toHaveTextContent('На все, навіть на акційні речі.');
		expect(result()).toHaveTextContent('Бонус для вас.');
		expect(result()).toHaveTextContent('Діє 24 години');
	});

	it('безкоштовна доставка — словами, без відсотка', () => {
		render(WheelResult, { prize: prize(0, true) });

		expect(result()).toHaveTextContent('Безкоштовна доставка');
		expect(result()).toHaveTextContent('На будь-яке замовлення.');
		expect(result()).not.toHaveTextContent('%');
	});

	it('кнопка «Обрати річ» закриває вікно', async () => {
		const onclose = vi.fn();
		render(WheelResult, { prize: prize(5), onclose });

		await fireEvent.click(screen.getByRole('button', { name: 'Обрати річ' }));
		expect(onclose).toHaveBeenCalled();
	});

	it('на сторінці колеса кнопка — посилання до покупок', () => {
		render(WheelResult, { prize: prize(5), href: '/collection/winter' });

		expect(screen.getByRole('link', { name: 'Обрати річ' })).toHaveAttribute(
			'href',
			'/collection/winter'
		);
	});

	it('щойно виграв — конфеті', async () => {
		render(WheelResult, { prize: prize(7), celebrate: true });

		await vi.waitFor(() => expect(confetti).toHaveBeenCalled());
	});

	it('повернувся з уже виграним призом — без конфеті', async () => {
		render(WheelResult, { prize: prize(7) });

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(confetti).not.toHaveBeenCalled();
	});
});
