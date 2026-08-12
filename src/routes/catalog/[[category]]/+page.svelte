<script lang="ts">
	import { page as pageState } from '$app/state';
	import CatalogFilters from '$lib/components/catalog/catalog-filters.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { Button } from '$lib/components/ui/button';
	import { SITE } from '$lib/config';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const title = $derived.by(() => {
		if (data.category) return data.category.name;
		if (data.filters.query) return `Пошук: ${data.filters.query}`;
		if (data.filters.sale) return 'Знижки';
		return 'Усі товари';
	});

	function pageUrl(target: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(pageState.url.searchParams);
		params.set('page', String(target));
		return `${pageState.url.pathname}?${params}`;
	}
</script>

<svelte:head>
	<title>{title} — {SITE.name}</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<nav class="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
		<a href="/" class="hover:text-foreground">Головна</a>
		<span>/</span>
		{#if data.category}
			<a href="/catalog" class="hover:text-foreground">Каталог</a>
			<span>/</span>
			<span class="text-foreground">{data.category.name}</span>
		{:else}
			<span class="text-foreground">Каталог</span>
		{/if}
	</nav>

	<header class="mb-10 flex flex-wrap items-baseline justify-between gap-3">
		<h1 class="font-heading text-4xl">{title}</h1>
		<p class="text-sm text-muted-foreground tabular-nums">{data.total} товарів</p>
	</header>

	<div class="grid gap-10 lg:grid-cols-[220px_1fr]">
		<aside class="lg:sticky lg:top-24 lg:self-start">
			<CatalogFilters
				facets={data.facets}
				sizes={data.filters.sizes}
				colors={data.filters.colors}
				sort={data.filters.sort}
			/>
		</aside>

		<div>
			{#if data.items.length === 0}
				<div class="rounded-lg border border-dashed py-24 text-center">
					<p class="font-heading text-xl">Нічого не знайшли</p>
					<p class="mt-2 text-sm text-muted-foreground">
						Спробуйте прибрати частину фільтрів або подивитись інші категорії.
					</p>
					<Button href="/catalog" variant="outline" class="mt-6">Показати всі товари</Button>
				</div>
			{:else}
				<ProductGrid products={data.items} />

				{#if data.pageCount > 1}
					<div class="mt-14 flex items-center justify-center gap-4">
						<Button
							href={pageUrl(data.page - 1)}
							variant="outline"
							size="icon"
							disabled={data.page <= 1}
							aria-label="Попередня сторінка"
						>
							<ChevronLeftIcon />
						</Button>
						<span class="text-sm tabular-nums">
							{data.page} / {data.pageCount}
						</span>
						<Button
							href={pageUrl(data.page + 1)}
							variant="outline"
							size="icon"
							disabled={data.page >= data.pageCount}
							aria-label="Наступна сторінка"
						>
							<ChevronRightIcon />
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
