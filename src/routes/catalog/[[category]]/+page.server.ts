import { SITE, SORT_OPTIONS, type SortOption } from '$lib/config';
import { getCategory, listCategoryCards, listFacets, listProducts } from '$lib/server/catalog';
import { breadcrumbsNode, itemListNode } from '$lib/server/seo';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const SORT_VALUES = SORT_OPTIONS.map((option) => option.value) as readonly string[];

function parseSort(value: string | null): SortOption {
	return SORT_VALUES.includes(value ?? '') ? (value as SortOption) : 'new';
}

type SeoInput = {
	category: { slug: string; name: string } | null;
	query: string;
	sale: boolean;
	page: number;
	total: number;
	pathname: string;
	sizes: string[];
	colors: string[];
};

/**
 * Заголовок, опис і канонічний адрес списку товарів.
 *
 * Два правила, без яких сайт з'їдає сам себе у видачі:
 * 1. Сторінки з фільтрами (розмір, колір, сортування) не індексуються —
 *    інакше в Google потрапляють тисячі майже однакових адрес.
 * 2. Канонічний адрес лишає тільки те, що змінює зміст: категорію,
 *    розпродаж і номер сторінки. Решта параметрів відкидається.
 */
function buildSeo(input: SeoInput) {
	const { category, query, sale, page, total, pathname, sizes, colors } = input;

	const params = new URLSearchParams();
	if (sale) params.set('sale', '1');
	if (page > 1) params.set('page', String(page));
	const suffix = params.size > 0 ? `?${params}` : '';

	const filtered = sizes.length > 0 || colors.length > 0;
	const pageSuffix = page > 1 ? ` — сторінка ${page}` : '';

	if (query) {
		return {
			title: `Пошук: ${query} — ${SITE.name}`,
			description: `Результати пошуку «${query}» у каталозі ${SITE.name}.`,
			canonical: pathname,
			index: false
		};
	}

	if (sale) {
		return {
			title: `Знижки на жіночий одяг${pageSuffix} — ${SITE.name}`,
			description: `Розпродаж жіночого одягу: ${total} моделей за зниженою ціною. Доставка по Україні, обмін 14 днів.`,
			canonical: `${pathname}${suffix}`,
			index: !filtered
		};
	}

	if (category) {
		return {
			title: `${category.name} — купити жіночий одяг в Україні${pageSuffix} | ${SITE.name}`,
			description: `${category.name} від ${SITE.name}: ${total} моделей у наявності. Доставка Новою Поштою по всій Україні, обмін і повернення 14 днів.`,
			canonical: `${pathname}${suffix}`,
			index: !filtered
		};
	}

	return {
		title: `Усі товари${pageSuffix} — ${SITE.name}`,
		description: `Каталог жіночого одягу ${SITE.name}: ${total} моделей у наявності. Доставка по Україні.`,
		canonical: `${pathname}${suffix}`,
		index: !filtered
	};
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
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

	// Гола /catalog — це вітрина категорій, а не звалище всіх товарів.
	// Пошук, розпродаж і фільтри лишаються звичайним списком.
	if (!categorySlug && !query && !sale && sizes.length === 0 && colors.length === 0) {
		const categories = await listCategoryCards();

		locals.jsonLd = [
			breadcrumbsNode(url.origin, [
				{ name: 'Головна', path: '/' },
				{ name: 'Каталог', path: '/catalog' }
			])
		];

		return {
			view: 'categories' as const,
			categories,
			seo: {
				title: `Каталог жіночого одягу — ${SITE.name}`,
				description:
					'Категорії жіночого одягу LILY LOOK: сукні, костюми, верхній одяг, блузи, спідниці й трикотаж. Доставка Новою Поштою по Україні, обмін 14 днів.',
				canonical: '/catalog',
				index: true
			}
		};
	}

	const [result, facets] = await Promise.all([
		listProducts({ categorySlug, sizes, colors, query, sale, sort, page }),
		listFacets(categorySlug)
	]);

	locals.jsonLd = [
		breadcrumbsNode(url.origin, [
			{ name: 'Головна', path: '/' },
			{ name: 'Каталог', path: '/catalog' },
			...(category ? [{ name: category.name, path: `/catalog/${category.slug}` }] : [])
		]),
		itemListNode(url.origin, category?.name ?? 'Каталог', result.items)
	];

	return {
		view: 'products' as const,
		category,
		facets,
		filters: { sizes, colors, query, sale, sort },
		seo: buildSeo({
			category,
			query,
			sale,
			page,
			total: result.total,
			pathname: url.pathname,
			sizes,
			colors
		}),
		...result
	};
};
