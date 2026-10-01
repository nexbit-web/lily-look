import { FREE_DELIVERY_FROM } from '$lib/config';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AddedToCartSheet from '$lib/components/product/added-to-cart-sheet.svelte';

/**
 * Вікно після «Додати в кошик». Головне в ньому — наступний крок перед
 * очима: без нього покупці клали річ у кошик і йшли з сайту.
 */
const props = (patch: Record<string, unknown> = {}) => ({
	open: true,
	name: 'Зимова куртка «Nord» шоколад',
	variant: { size: 'M', color: 'Шоколад' },
	price: 287_000,
	image: null,
	cart: { count: 1, subtotal: 287_000 },
	...patch
});

describe('вікно «Додано в кошик»', () => {
	it('показує, що саме додано', () => {
		render(AddedToCartSheet, props());

		expect(screen.getByRole('dialog', { name: 'Додано в кошик' })).toBeInTheDocument();
		expect(screen.getByText('Зимова куртка «Nord» шоколад')).toBeInTheDocument();
		expect(screen.getByText('Шоколад · M')).toBeInTheDocument();
	});

	it('веде одразу на оформлення', () => {
		render(AddedToCartSheet, props());

		expect(screen.getByRole('link', { name: 'Оформити замовлення' })).toHaveAttribute(
			'href',
			'/checkout'
		);
		expect(screen.getByRole('button', { name: 'Продовжити покупки' })).toBeInTheDocument();
	});

	it('каже, скільки в кошику й скільки бракує до безкоштовної доставки', () => {
		render(AddedToCartSheet, props({ cart: { count: 2, subtotal: FREE_DELIVERY_FROM - 113_000 } }));

		const summary = document.querySelector('[data-slot="cart-summary"]');
		expect(summary).toHaveTextContent(/У кошику 2 товари/);
		expect(summary).toHaveTextContent(/До безкоштовної доставки — ще 1\s130\sгрн/);
	});

	it('набрали на безкоштовну доставку — так і пише', () => {
		render(AddedToCartSheet, props({ cart: { count: 2, subtotal: FREE_DELIVERY_FROM } }));

		expect(screen.getByText('Доставка для вас безкоштовна')).toBeInTheDocument();
	});

	it('без підсумку кошика рядка про кошик немає', () => {
		render(AddedToCartSheet, props({ cart: null }));

		expect(document.querySelector('[data-slot="cart-summary"]')).toBeNull();
		expect(screen.getByRole('link', { name: 'Оформити замовлення' })).toBeInTheDocument();
	});
});
