import type { CatalogFacets } from '$lib/types';
import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogFilters from './catalog-filters.svelte';

// Фільтри — це посилання, зібрані з поточного URL, тож саме його й підміняємо.
const state = { url: new URL('https://lilylook.test/catalog') };
vi.mock('$app/state', () => ({
	get page() {
		return state;
	}
}));

const facets: CatalogFacets = {
	sizes: ['S', 'M', 'L'],
	colors: [
		{ name: 'Чорний', hex: '#1C1917' },
		{ name: 'Молочний', hex: '#EFE9E1' },
		{ name: 'Хакі', hex: null }
	]
};

function at(url: string) {
	state.url = new URL(url, 'https://lilylook.test');
}

const link = (name: string | RegExp) => screen.getByRole('link', { name });

beforeEach(() => at('/catalog'));

describe('фільтри каталогу', () => {
	it('додає обраний розмір до адреси', () => {
		render(CatalogFilters, { facets, sizes: [], colors: [] });

		expect(link('S')).toHaveAttribute('href', '/catalog?size=S');
	});

	it('повторний клік знімає фільтр, решта лишається', () => {
		at('/catalog?size=S&size=M');
		render(CatalogFilters, { facets, sizes: ['S', 'M'], colors: [] });

		expect(link('S')).toHaveAttribute('href', '/catalog?size=M');
		expect(link('M')).toHaveAttribute('href', '/catalog?size=S');
	});

	it('зміна фільтра скидає сторінку пагінації', () => {
		at('/catalog?page=4&sort=price-asc');
		render(CatalogFilters, { facets, sizes: [], colors: [] });

		const href = link('S').getAttribute('href') ?? '';
		expect(href).not.toContain('page=');
		// Сортування при цьому зберігається.
		expect(href).toContain('sort=price-asc');
	});

	it('позначає активні розмір і колір', () => {
		render(CatalogFilters, { facets, sizes: ['M'], colors: ['Чорний'] });

		expect(link('M')).toHaveAttribute('aria-current', 'true');
		expect(link('S')).not.toHaveAttribute('aria-current');
		expect(link('Чорний')).toHaveAttribute('aria-current', 'true');
	});

	it('колір без коду показує назву замість кружечка', () => {
		render(CatalogFilters, { facets, sizes: [], colors: [] });

		expect(link('Хакі')).toHaveTextContent('Хакі');
		expect(link('Чорний').querySelector('[style*="background-color"]')).not.toBeNull();
	});

	it('кольори живуть у власному блоці з прокруткою', () => {
		render(CatalogFilters, { facets, sizes: [], colors: [] });

		const box = link('Чорний').closest('.scrollbar-hover');
		expect(box).not.toBeNull();
		expect(box).toHaveClass('overflow-y-auto');
	});

	it('скидання показує кількість обраного і веде на чисту адресу', () => {
		at('/catalog?size=M&color=Чорний');
		render(CatalogFilters, { facets, sizes: ['M'], colors: ['Чорний'] });

		expect(link(/Скинути фільтри/)).toHaveAttribute('href', '/catalog');
		expect(link(/Скинути фільтри/)).toHaveTextContent('(2)');
	});

	it('без обраного кнопки скидання немає', () => {
		render(CatalogFilters, { facets, sizes: [], colors: [] });

		expect(screen.queryByText(/Скинути фільтри/)).not.toBeInTheDocument();
	});
});
