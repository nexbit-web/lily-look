import type { CategoryCard } from '$lib/types';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import CategoryGrid from './category-grid.svelte';

const categories: CategoryCard[] = [
	{ slug: 'sukni', name: 'Сукні', productCount: 5, imageUrl: 'https://example.test/1.jpg' },
	{ slug: 'bluzy', name: 'Блузи та сорочки', productCount: 1, imageUrl: null }
];

describe('вітрина категорій', () => {
	it('веде в кожну категорію', () => {
		render(CategoryGrid, { categories });

		expect(screen.getByRole('link', { name: 'Сукні' })).toHaveAttribute('href', '/catalog/sukni');
		expect(screen.getByRole('link', { name: 'Блузи та сорочки' })).toHaveAttribute(
			'href',
			'/catalog/bluzy'
		);
	});

	it('назва категорії в розмітці одна — під плиткою', () => {
		render(CategoryGrid, { categories });

		// На самому фото назва намальована, тож дублювати її текстом не треба.
		expect(screen.getAllByText('Сукні')).toHaveLength(1);
		expect(screen.getByRole('link', { name: 'Сукні' })).toBeInTheDocument();
	});

	it('без фото плитка лишається клікабельною', () => {
		render(CategoryGrid, { categories });

		// Знімок лише в першої категорії, друга живе на кольорі-заглушці.
		expect(document.querySelectorAll('img')).toHaveLength(1);
		expect(screen.getByRole('link', { name: 'Блузи та сорочки' })).toBeInTheDocument();
	});
});
