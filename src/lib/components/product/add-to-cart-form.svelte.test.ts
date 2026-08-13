import type { ProductDetail } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AddToCartForm from './add-to-cart-form.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
vi.mock('svelte-hot-french-toast', () => ({
	default: { success: vi.fn(), error: vi.fn() }
}));

const variant = (patch: Partial<ProductDetail['variants'][number]>) => ({
	id: 'v-s-pudra',
	size: 'S',
	color: 'Пудровий',
	colorHex: '#e8c9c9',
	price: 264_900,
	stock: 5,
	...patch
});

const product: ProductDetail = {
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сатинова сукня Olivia',
	description: 'Сатин зі шляхетним блиском.',
	price: 264_900,
	compareAt: null,
	category: { slug: 'sukni', name: 'Сукні' },
	images: [{ url: 'https://example.test/1.jpg', alt: 'фото' }],
	variants: [
		variant({}),
		variant({ id: 'v-m-pudra', size: 'M', stock: 2 }),
		variant({ id: 'v-l-pudra', size: 'L', stock: 0 }),
		variant({ id: 'v-s-zelen', color: 'Зелений', colorHex: '#14532d', stock: 0 })
	]
};

const buy = () => screen.getByRole('button', { name: /Оберіть розмір|Додати в кошик|Немає/ });

describe('форма купівлі', () => {
	it('до вибору розміру купити не можна', () => {
		render(AddToCartForm, { product });

		expect(buy()).toBeDisabled();
		expect(buy()).toHaveTextContent('Оберіть розмір');
		expect(document.querySelector('input[name="variantId"]')).toHaveValue('');
	});

	it('після вибору розміру у форму лягає id варіанта', async () => {
		render(AddToCartForm, { product });

		await fireEvent.click(screen.getByRole('button', { name: 'S' }));

		expect(document.querySelector('input[name="variantId"]')).toHaveValue('v-s-pudra');
		expect(buy()).toBeEnabled();
		expect(buy()).toHaveTextContent('Додати в кошик');
	});

	it('розмір без залишку вибрати не можна', () => {
		render(AddToCartForm, { product });
		expect(screen.getByRole('button', { name: 'L' })).toBeDisabled();
	});

	it('попереджає, коли лишилось мало', async () => {
		render(AddToCartForm, { product });

		await fireEvent.click(screen.getByRole('button', { name: 'M' }));
		expect(screen.getByText(/Залишилось 2 шт/)).toBeInTheDocument();
	});

	it('зміна кольору скидає розмір, якого в ньому немає', async () => {
		render(AddToCartForm, { product });

		await fireEvent.click(screen.getByRole('button', { name: 'S' }));
		expect(document.querySelector('input[name="variantId"]')).toHaveValue('v-s-pudra');

		await fireEvent.click(screen.getByRole('button', { name: 'Зелений' }));

		// у зеленому S немає — вибір скинуто, купити знову не можна
		expect(document.querySelector('input[name="variantId"]')).toHaveValue('');
		expect(buy()).toBeDisabled();
	});

	it('коли розібрали все — кнопка каже про це прямо', () => {
		render(AddToCartForm, {
			product: {
				...product,
				variants: product.variants.map((item) => ({ ...item, stock: 0 }))
			}
		});

		expect(buy()).toHaveTextContent('Немає в наявності');
		expect(buy()).toBeDisabled();
	});

	it('показує знижку від старої ціни', () => {
		render(AddToCartForm, { product: { ...product, compareAt: 330_000 } });
		expect(screen.getByText('−20%')).toBeInTheDocument();
	});

	it('назва з розмітки лишається текстом, а не стає HTML', () => {
		const attack = '<img src=x onerror="alert(1)">';
		render(AddToCartForm, { product: { ...product, name: attack } });

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(attack);
		expect(document.querySelector('img[src="x"]')).toBeNull();
	});
});
