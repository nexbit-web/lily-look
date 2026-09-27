import type { ProductCard as ProductCardData } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ProductCard from '$lib/components/product/product-card.svelte';

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

	/**
	 * Баг, який ловили на живому сайті: фото вже завантажене, а картка сіра,
	 * доки на неї не навести курсор. Кадр стояв прозорим, поки скрипт не
	 * підтвердить завантаження, — і коли підтвердження запізнювалось, готове
	 * фото лишалось невидимим. Тепер фото не ховається ніколи.
	 */
	it('фото видно, навіть поки скрипт не дізнався, що воно завантажилось', () => {
		const { container } = render(ProductCard, { product: product() });

		const cover = screen.getByRole('img', { name: 'Сукня спереду' });
		expect(cover).not.toHaveClass('opacity-0');
		// Пульсує тільки заглушка під фото, а не вся рамка разом із кадром.
		expect(cover.closest('.animate-pulse')).toBeNull();
		expect(container.querySelector('.animate-pulse')).not.toBeNull();
	});

	it('фото приїхало — заглушку прибрано', async () => {
		const { container } = render(ProductCard, { product: product() });

		await fireEvent.load(screen.getByRole('img', { name: 'Сукня спереду' }));

		expect(container.querySelector('.animate-pulse')).toBeNull();
	});

	it('показує, що товару немає в наявності', () => {
		render(ProductCard, { product: product({ inStock: false }) });

		expect(screen.getByText('Немає в наявності')).toBeInTheDocument();
	});
});

describe('фото картки', () => {
	it('просить у CDN кадр під розмір картки, а не оригінал', () => {
		render(ProductCard, {
			product: product({
				image: {
					url: 'https://res.cloudinary.com/demo/image/upload/v1/lily/abc.png',
					alt: 'Сукня'
				}
			})
		});

		const image = screen.getByAltText('Сукня');
		// Один розмір на всі екрани: CDN ріже кадр один раз, а не 400 і 800 окремо.
		expect(image.getAttribute('src')).toBe(
			'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_800/v1/lily/abc.png'
		);
		expect(image.hasAttribute('srcset')).toBe(false);
	});

	it('CDN не віддав кадр — показуємо оригінал, а не сіру пляму', async () => {
		const url = 'https://res.cloudinary.com/demo/image/upload/v1/lily/abc.png';
		render(ProductCard, { product: product({ image: { url, alt: 'Сукня' } }) });

		const image = screen.getByAltText('Сукня');
		await fireEvent.error(image);

		expect(image.getAttribute('src')).toBe(url);
		expect(image.getAttribute('srcset')).toBe('');
	});
});

describe('друге фото й дотиковий екран', () => {
	it('без курсора другого фото немає зовсім — на телефоні його нічим показати', () => {
		// Дотиковий екран: жоден hover-запит не підходить.
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false
		}));

		render(ProductCard, {
			product: product({
				hoverImage: { url: 'https://example.test/2.jpg', alt: '' }
			})
		});

		// Одне фото замість двох: сітка на телефоні важить удвічі менше.
		expect(document.querySelectorAll('img')).toHaveLength(1);
		vi.unstubAllGlobals();
	});
});
