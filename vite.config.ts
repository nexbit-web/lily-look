import { svelteTesting } from '@testing-library/svelte/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
// defineConfig саме з vitest/config — інакше поле `test` не типізоване.
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],

	test: {
		// Потоки замість форків: на Windows форк-воркери стартують так довго,
		// що падають по таймауту ще до першого тесту.
		pool: 'threads',

		// Два прогони: серверна логіка в node, компоненти — у jsdom.
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					pool: 'threads',
					environment: 'node',
					clearMocks: true,
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					pool: 'threads',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			}
		]
	}
});
