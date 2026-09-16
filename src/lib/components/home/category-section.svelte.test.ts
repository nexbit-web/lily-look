import type { HomeSection, ProductCard } from '$lib/types';
import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CategorySection from './category-section.svelte';

/**
 * Стрічка категорії на головній.
 *
 * Стрічку малюють тільки тоді, коли до неї догортали (це вирішує
 * `category-feed`), тож тут перевіряємо саме появу: те, що прийшло з
 * сервером, малюється без жодного запиту, а решта просить картки одразу
 * й тримає під них місце заглушкою.
 */

const card = (patch: Partial<ProductCard> = {}): ProductCard => ({
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сукня Olivia',
	price: 219_900,
	compareAt: null,
	image: { url: 'https://example.test/1.jpg', alt: 'Сукня' },
	hoverImage: null,
	colors: ['Чорний'],
	inStock: true,
	...patch
});

const section = (patch: Partial<HomeSection> = {}): HomeSection => ({
	slug: 'sukni',
	name: 'Сукні',
	productCount: 4,
	products: null,
	...patch
});

const fetchMock = vi.fn();
const skeleton = () => document.querySelector('[data-slot="grid-skeleton"]');

beforeEach(() => {
	fetchMock.mockReset();
	// Запит, що ніколи не завершується, — стан «картки в дорозі».
	fetchMock.mockReturnValue(new Promise(() => {}));
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('стрічка категорії', () => {
	it('картки з сервера малюються одразу й нічого не просять', () => {
		render(CategorySection, { section: section({ products: [card()] }) });

		expect(screen.getByText('Сукня Olivia')).toBeInTheDocument();
		expect(skeleton()).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('без карток одразу просить їх у сервера', () => {
		render(CategorySection, { section: section() });

		expect(fetchMock).toHaveBeenCalledWith('/api/category/sukni');
		// Назва категорії й посилання на неї є в розмітці завжди — навіть
		// коли карток ще немає й коли JS не спрацював зовсім.
		expect(screen.getByRole('heading', { name: 'Сукні' })).toBeInTheDocument();
	});

	it('заглушка займає стільки місця, скільки приїде карток', () => {
		render(CategorySection, { section: section({ productCount: 3 }) });

		expect(skeleton()?.children).toHaveLength(3);
	});

	it('картки приїхали — заглушка зникає', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ products: [card({ name: 'Сукня Mia' })] })
		});

		render(CategorySection, { section: section() });

		await waitFor(() => expect(screen.getByText('Сукня Mia')).toBeInTheDocument());
		expect(skeleton()).toBeNull();
	});

	it('запит не вдався — дорога в категорію лишається', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 500 });

		render(CategorySection, { section: section() });

		const link = await screen.findByRole('link', { name: 'Відкрити категорію' });
		expect(link).toHaveAttribute('href', '/catalog/sukni');
	});

	it('коли в категорії є ще речі — веде подивитись усі', () => {
		render(CategorySection, { section: section({ productCount: 20, products: [card()] }) });

		expect(screen.getByRole('link', { name: 'Дивитись усю категорію' })).toHaveAttribute(
			'href',
			'/catalog/sukni'
		);
	});

	it('нічого не лишилось за посиланням — зайвої кнопки немає', () => {
		render(CategorySection, { section: section({ productCount: 1, products: [card()] }) });

		expect(screen.queryByRole('link', { name: 'Дивитись усю категорію' })).not.toBeInTheDocument();
	});

	it('кількості товарів у категорії ніде не показує', () => {
		render(CategorySection, { section: section({ productCount: 20, products: [card()] }) });

		expect(screen.queryByText(/20/)).not.toBeInTheDocument();
		expect(screen.queryByText(/реч/i)).not.toBeInTheDocument();
	});
});
