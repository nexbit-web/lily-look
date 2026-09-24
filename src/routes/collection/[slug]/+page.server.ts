import { CATALOG_CACHE_MS, COLLECTIONS } from '$lib/config';
import { cached } from '$lib/server/cache';
import { listCollection } from '$lib/server/catalog';
import {
	breadcrumbsNode,
	collectionDescription,
	collectionIntro,
	collectionTitle,
	itemListNode,
	priceRangeOf
} from '$lib/server/seo';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const collection = COLLECTIONS.find((item) => item.slug === params.slug);
	if (!collection) error(404, 'Такої колекції немає');

	// Сторінка однакова для всіх — тримаємо в пам'яті, як і головну.
	const shelves = await cached(`collection:${collection.slug}`, CATALOG_CACHE_MS, () =>
		listCollection(collection.categories)
	);

	const products = shelves.flatMap((shelf) => shelf.products);
	const names = shelves.map((shelf) => shelf.name);
	const range = priceRangeOf(products);
	const path = `/collection/${collection.slug}`;

	locals.jsonLd = [
		breadcrumbsNode(url.origin, [
			{ name: 'Головна', path: '/' },
			{ name: collection.name, path }
		]),
		itemListNode(url.origin, collection.name, products)
	];

	return {
		collection: { name: collection.name, lead: collection.lead },
		shelves,
		total: products.length,
		seo: {
			title: collectionTitle(collection.name, names),
			description: collectionDescription(collection.name, products.length, range, names),
			canonical: path,
			// Розібрали все — сторінка без змісту в індексі шкодить сайту цілком.
			index: products.length > 0
		},
		intro:
			products.length > 0 ? collectionIntro(collection.name, products.length, range, names) : null
	};
};
