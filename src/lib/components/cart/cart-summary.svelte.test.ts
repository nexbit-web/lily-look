import { FREE_DELIVERY_FROM } from '$lib/config';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import CartSummary from './cart-summary.svelte';

describe('підсумок кошика', () => {
	it('узгоджує форму слова з кількістю', () => {
		const { unmount } = render(CartSummary, { subtotal: 100_000, count: 1 });
		expect(screen.getByText(/^\s*1\s+товар\s*$/)).toBeInTheDocument();
		unmount();

		render(CartSummary, { subtotal: 500_000, count: 5 });
		expect(screen.getByText(/^\s*5\s+товарів\s*$/)).toBeInTheDocument();
	});

	it('нижче порогу показує, скільки лишилось до безкоштовної доставки', () => {
		render(CartSummary, { subtotal: FREE_DELIVERY_FROM - 70_000, count: 1 });

		expect(screen.getByText(/Ще .* безкоштовна/)).toBeInTheDocument();
		expect(screen.getByText('Розрахуємо далі')).toBeInTheDocument();
		expect(document.querySelector('[data-slot="progress"]')).toBeInTheDocument();
	});

	it('від порогу прибирає смужку й пише «Безкоштовно»', () => {
		render(CartSummary, { subtotal: FREE_DELIVERY_FROM, count: 3 });

		expect(screen.getByText('Безкоштовно')).toBeInTheDocument();
		expect(document.querySelector('[data-slot="progress"]')).not.toBeInTheDocument();
	});

	it('порожній кошик не пускає на чекаут', () => {
		render(CartSummary, { subtotal: 0, count: 0 });

		const checkout = screen.getByRole('link', { name: /Оформити замовлення/ });
		expect(checkout).toHaveAttribute('aria-disabled', 'true');
		expect(checkout).not.toHaveAttribute('href');
	});

	it('веде на чекаут, коли є що купувати', () => {
		render(CartSummary, { subtotal: 264_900, count: 1 });

		expect(screen.getByRole('link', { name: /Оформити замовлення/ })).toHaveAttribute(
			'href',
			'/checkout'
		);
	});
});
