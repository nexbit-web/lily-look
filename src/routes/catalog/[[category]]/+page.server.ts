import { SORT_OPTIONS, type SortOption } from '$lib/config';
import { getCategory, listFacets, listProducts } from '$lib/server/catalog';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const SORT_VALUES = SORT_OPTIONS.map((option) => option.value) as readonly string[];

function parseSort(value: string | null): SortOption {
	return SORT_VALUES.includes(value ?? '') ? (value as SortOption) : 'new';
}

export const load: PageServerLoad = async ({ params, url }) => {
	const categorySlug = params.category;

	const category = categorySlug ? await getCategory(categorySlug) : null;
	if (categorySlug && !category) {
		error(404, 'Такої категорії не існує');
	}

	const sizes = url.searchParams.getAll('size');
	const colors = url.searchParams.getAll('color');
	const query = url.searchParams.get('q')?.trim() ?? '';
	const sale = url.searchParams.get('sale') === '1';
	const sort = parseSort(url.searchParams.get('sort'));
	const page = Number(url.searchParams.get('page')) || 1;

	const [result, facets] = await Promise.all([
		listProducts({ categorySlug, sizes, colors, query, sale, sort, page }),
		listFacets(categorySlug)
	]);

	return {
		category,
		facets,
		filters: { sizes, colors, query, sale, sort },
		...result
	};
};
