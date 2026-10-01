import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PrizeBar from '$lib/components/wheel/prize-bar.svelte';

/** Смужка з виграним призом і таймером до його згоряння. */
const prize = (expiresAt: string) => ({
	code: 'off5',
	label: 'Знижка 5%',
	percent: 5,
	freeDelivery: false,
	expiresAt
});

afterEach(() => {
	vi.useRealTimers();
});

describe('смужка приза', () => {
	it('показує приз і скільки він ще діє', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-01T10:00:00Z') });
		render(PrizeBar, { prize: prize('2026-10-01T12:30:05Z') });
		await vi.advanceTimersByTimeAsync(0);

		const bar = document.querySelector('[data-slot="prize-bar"]');
		expect(bar).toHaveTextContent('Знижка 5%');
		expect(bar).toHaveTextContent('02:30:05');
	});

	it('таймер іде щосекунди', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-01T10:00:00Z') });
		render(PrizeBar, { prize: prize('2026-10-01T10:01:00Z') });
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(5000);

		expect(screen.getByText('00:00:55')).toBeInTheDocument();
	});

	it('приз згорів — смужка зникає', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-01T10:00:00Z') });
		render(PrizeBar, { prize: prize('2026-10-01T10:00:02Z') });
		await vi.advanceTimersByTimeAsync(3000);

		expect(document.querySelector('[data-slot="prize-bar"]')).toBeNull();
	});

	it('порожній кошик веде до курток, повний — у кошик', () => {
		const { unmount } = render(PrizeBar, { prize: prize('2099-01-01'), cartCount: 0 });
		expect(document.querySelector('a')).toHaveAttribute('href', '/collection/winter');
		unmount();

		render(PrizeBar, { prize: prize('2099-01-01'), cartCount: 2 });
		expect(document.querySelector('a')).toHaveAttribute('href', '/cart');
	});
});
