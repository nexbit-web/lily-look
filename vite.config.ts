import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
// defineConfig саме з vitest/config — інакше поле `test` не типізоване.
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		// Налаштування самого SvelteKit — у svelte.config.js.
		sveltekit()
	],

	test: {
		// Потоки замість форків: на Windows форк-воркери стартують так довго,
		// що падають по таймауту ще до першого тесту. З тієї ж причини
		// обмежуємо кількість воркерів — інакше вони душать один одного.
		pool: 'threads',
		maxWorkers: 2,

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
