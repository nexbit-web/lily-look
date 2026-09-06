// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { JsonLdNode } from '$lib/server/seo';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * Розмітка Schema.org сторінки. Load-функція складає сюди вузли,
			 * hooks.server.ts перетворює їх на єдиний тег у <head>.
			 */
			jsonLd?: JsonLdNode[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
