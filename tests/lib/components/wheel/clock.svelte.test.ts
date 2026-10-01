import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Clock from '$lib/components/wheel/clock.svelte';

/** Цифри таймера приза — і скелетон, поки браузер їх ще не порахував. */
describe('таймер приза', () => {
	it('поки часу немає — скелетон шириною рівно з цифри, прихований від скрінрідера', () => {
		const { container } = render(Clock, { left: null });

		const skeleton = container.querySelector('[data-slot="clock-skeleton"]');
		expect(skeleton).toHaveAttribute('aria-hidden', 'true');
		// Невидимі «00:00:00» тримають місце — рядок не зсунеться, коли з'явиться час.
		expect(skeleton?.querySelector('.invisible')).toHaveTextContent('00:00:00');
	});

	it('час є — цифри замість скелетона', () => {
		const { container } = render(Clock, { left: (2 * 3600 + 5 * 60 + 7) * 1000 });

		expect(container.querySelector('[data-slot="clock-skeleton"]')).toBeNull();
		expect(container).toHaveTextContent('02:05:07');
	});
});
