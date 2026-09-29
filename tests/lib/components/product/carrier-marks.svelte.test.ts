import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import CarrierMarks from '$lib/components/product/carrier-marks.svelte';

describe('перевізники', () => {
	it('називає обох перевізників словами', () => {
		render(CarrierMarks);

		expect(screen.getByText('Нова Пошта')).toBeInTheDocument();
		expect(screen.getByText('Укрпошта')).toBeInTheDocument();
	});

	it('знаки вбудовані в розмітку й сховані від скрінрідера', () => {
		const { container } = render(CarrierMarks);

		const marks = container.querySelectorAll('svg');
		expect(marks).toHaveLength(2);
		for (const mark of marks) expect(mark).toHaveAttribute('aria-hidden', 'true');
		// Жодного запиту за картинкою.
		expect(container.querySelector('img')).toBeNull();
	});
});
