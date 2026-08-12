import { NovaPoshtaError, searchSettlements } from '$lib/server/nova-poshta';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** GET /api/nova-poshta/settlements?q=київ */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	try {
		const items = await searchSettlements(url.searchParams.get('q') ?? '');
		// Довідник статичний — хай кешують і браузер, і CDN.
		setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=3600' });
		return json({ items });
	} catch (cause) {
		if (cause instanceof NovaPoshtaError) error(cause.status, cause.message);
		throw cause;
	}
};
