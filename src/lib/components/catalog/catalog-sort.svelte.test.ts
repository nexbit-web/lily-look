import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogSort from './catalog-sort.svelte';

const state = { url: new URL('https://lilylook.test/catalog') };
vi.mock('$app/state', () => ({
	get page() {
		return state;
	}
}));

function at(url: string) {
	state.url = new URL(url, 'https://lilylook.test');
}

beforeEach(() => at('/catalog'));

describe('сортування каталогу', () => {
	it('дає посилання на кожен варіант', () => {
		render(CatalogSort, { sort: 'new' });

		const links = screen.getAllByRole('link');
		expect(links.map((item) => item.getAttribute('href'))).toEqual([
			'/catalog?sort=new',
			'/catalog?sort=price-asc',
			'/catalog?sort=price-desc'
		]);
	});

	it('зберігає фільтри й скидає сторінку', () => {
		at('/catalog?size=M&page=3&sort=new');
		render(CatalogSort, { sort: 'new' });

		const href = screen.getByRole('link', { name: /від меншої/ }).getAttribute('href') ?? '';
		expect(href).toContain('size=M');
		expect(href).toContain('sort=price-asc');
		expect(href).not.toContain('page=');
	});

	it('позначає поточний варіант', () => {
		render(CatalogSort, { sort: 'price-desc' });

		expect(screen.getByRole('link', { name: /від більшої/ })).toHaveAttribute(
			'aria-current',
			'true'
		);
		expect(screen.getByRole('link', { name: /Спочатку нові/ })).not.toHaveAttribute('aria-current');
	});

	it('на екрані — тільки «Новинки» і «Ціна», напрям показує стрілка', () => {
		render(CatalogSort, { sort: 'new' });

		const labels = screen.getAllByRole('link').map((item) => item.textContent?.trim());
		expect(labels).toEqual(['Новинки', 'Ціна', 'Ціна']);
		// Два однакові написи мають різні доступні імена — інакше їх не розрізнити
		// ні скрінрідером, ні в підказці.
		expect(screen.getAllByRole('link').map((item) => item.getAttribute('aria-label'))).toEqual([
			'Спочатку нові надходження',
			'Ціна: від меншої до більшої',
			'Ціна: від більшої до меншої'
		]);
	});
});
