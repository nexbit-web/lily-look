<script lang="ts">
	// Стилі nprogress не імпортуємо — фірмова смужка описана в app.css.
	import '../app.css';
	import { navigating } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Footer from '$lib/components/layout/footer.svelte';
	import Header from '$lib/components/layout/header.svelte';
	import { SITE } from '$lib/config';
	import nprogress from 'nprogress';
	import { Toaster } from 'svelte-hot-french-toast';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	nprogress.configure({ showSpinner: false, minimum: 0.15, speed: 400 });

	// Смужка прогресу з'являється тільки на переходах, довших за 120 мс:
	// на швидких навігаціях блимання дратує сильніше, ніж допомагає.
	$effect(() => {
		if (!navigating.to) {
			nprogress.done();
			return;
		}

		const timer = setTimeout(() => nprogress.start(), 120);
		return () => {
			clearTimeout(timer);
			nprogress.done();
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content={SITE.description} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<Header categories={data.categories} cartCount={data.cartCount} />

	<main class="flex-1">
		{@render children()}
	</main>

	<Footer categories={data.categories} />
</div>

<Toaster
	position="top-center"
	toastOptions={{
		duration: 3000,
		class: 'app-toast',
		style:
			'background: var(--card); color: var(--foreground); box-shadow: 0 4px 16px -4px rgba(0,0,0,0.25); padding: 10px 14px; font-size: 13.5px; border-radius: 1rem;',
		iconTheme: {
			primary: 'var(--primary)',
			secondary: 'var(--primary-foreground)'
		}
	}}
/>
