import { NovaPoshtaError, listWarehouses } from '$lib/server/nova-poshta';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** GET /api/nova-poshta/warehouses?settlement=<ref>&q=12 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const settlement = url.searchParams.get('settlement');
	if (!settlement) error(400, 'Не вказано населений пункт');

	try {
		const items = await listWarehouses(settlement, url.searchParams.get('q') ?? '');
		setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=3600' });
		return json({ items });
	} catch (cause) {
		if (cause instanceof NovaPoshtaError) error(cause.status, cause.message);
		throw cause;
	}
};
