import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PrizeOffer from '$lib/components/product/prize-offer.svelte';

/** Розклад ціни з призом колеса під ціною товару. */
const prize = (percent: number, freeDelivery = false) => ({
	code: freeDelivery ? 'delivery' : `off${percent}`,
	label: freeDelivery ? 'Безкоштовна доставка' : `Знижка ${percent}%`,
	percent,
	freeDelivery,
	expiresAt: '2026-10-02T10:00:00Z'
});

const offer = () => document.querySelector('[data-slot="prize-offer"]');
// Між числом і «грн» — нерозривний пробіл, тож порівнюємо без пробілів.
const text = () => offer()?.textContent?.replace(/\s+/g, '') ?? '';

afterEach(() => {
	vi.useRealTimers();
});

describe('приз під ціною товару', () => {
	it('річ без акції: звичайна ціна, приз і скільки економите', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-01T10:00:00Z') });
		render(PrizeOffer, { prize: prize(10), price: 278_000 });
		await vi.advanceTimersByTimeAsync(0);

		expect(text()).toContain('Звичайнаціна2780грн');
		expect(text()).toContain('Вашприз−10%−278грн');
		expect(text()).toContain('Визаощаджуєте278грн');
		expect(text()).not.toContain('Знижкамагазину');
		expect(offer()).toHaveTextContent('24:00:00');
	});

	it('акційна річ: знижка магазину плюс приз — економія разом', async () => {
		render(PrizeOffer, { prize: prize(10), price: 270_000, compareAt: 480_000 });
		await vi.waitFor(() => expect(offer()).not.toBeNull());

		expect(text()).toContain('Звичайнаціна4800грн');
		expect(text()).toContain('Знижкамагазину−44%−2100грн');
		expect(text()).toContain('+вашприз−10%−270грн');
		expect(text()).toContain('Визаощаджуєте2370грн(−49%)');
	});

	it('безкоштовна доставка — без розкладу ціни', async () => {
		render(PrizeOffer, { prize: prize(0, true), price: 278_000 });
		await vi.waitFor(() => expect(offer()).not.toBeNull());

		expect(offer()).toHaveTextContent('безкоштовна доставка');
		expect(text()).not.toContain('Визаощаджуєте');
	});
});
