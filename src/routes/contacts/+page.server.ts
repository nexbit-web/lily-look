import { breadcrumbsNode } from '$lib/server/seo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	locals.jsonLd = [
		breadcrumbsNode(url.origin, [
			{ name: 'Головна', path: '/' },
			{ name: 'Контакти', path: '/contacts' }
		])
	];
};
