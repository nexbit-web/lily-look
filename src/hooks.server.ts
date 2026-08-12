import { isDatabaseConfigured } from '$lib/server/db';
import { redirect, type Handle } from '@sveltejs/kit';

/**
 * Поки DATABASE_URL не заданий, будь-який запит веде на /setup з інструкцією.
 * Це рятує від стіни стектрейсів Prisma одразу після `git clone`.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const onSetupPage = event.url.pathname === '/setup';

	if (!isDatabaseConfigured() && !onSetupPage) {
		redirect(307, '/setup');
	}
	if (isDatabaseConfigured() && onSetupPage) {
		redirect(307, '/');
	}

	return resolve(event);
};
