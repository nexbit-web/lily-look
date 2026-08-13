import type { ProductCard as ProductCardData } from '$lib/types';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProductCard from './product-card.svelte';

const product = (patch: Partial<ProductCardData> = {}): ProductCardData => ({
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сатинова сукня Olivia',
	price: 219_900,
	compareAt: null,
	image: { url: 'https://example.test/1.jpg', alt: 'Сукня спереду' },
	hoverImage: null,
	colors: ['Чорний'],
	inStock: true,
	...patch
});

describe('картка товару', () => {
	it('веде на сторінку товару', () => {
		render(ProductCard, { product: product() });

		expect(screen.getByRole('link')).toHaveAttribute('href', '/product/suknia-olivia');
	});

	it('рахує знижку від старої ціни', () => {
		render(ProductCard, { product: product({ price: 219_900, compareAt: 299_900 }) });

		// 219900 / 299900 → -27 %
		expect(screen.getByText('−27%')).toBeInTheDocument();
	});

	it('без старої ціни плашки немає', () => {
		render(ProductCard, { product: product({ compareAt: 199_900 }) });

		expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
	});

	it('друге фото лежить у картці й сховане від скрінрідера', () => {
		render(ProductCard, {
			product: product({ hoverImage: { url: 'https://example.test/2.jpg', alt: 'ззаду' } })
		});

		const images = document.querySelectorAll('img');
		expect(images).toHaveLength(2);
		// Для скрінрідера картка має одне фото — друге суто декоративне.
		expect(screen.getAllByRole('img')).toHaveLength(1);
		expect(images[1]).toHaveAttribute('src', 'https://example.test/2.jpg');
	});

	it('без другого фото лишається один знімок', () => {
		render(ProductCard, { product: product() });

		expect(document.querySelectorAll('img')).toHaveLength(1);
	});

	it('перше фото на першому екрані вантажиться одразу, решта — ліниво', () => {
		const { unmount } = render(ProductCard, { product: product(), priority: true });
		expect(document.querySelector('img')).toHaveAttribute('loading', 'eager');
		unmount();

		render(ProductCard, { product: product() });
		expect(document.querySelector('img')).toHaveAttribute('loading', 'lazy');
	});

	it('показує, що товару немає в наявності', () => {
		render(ProductCard, { product: product({ inStock: false }) });

		expect(screen.getByText('Немає в наявності')).toBeInTheDocument();
	});
});
