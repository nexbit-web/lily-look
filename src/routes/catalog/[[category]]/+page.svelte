<script lang="ts">
	import { page as pageState } from '$app/state';
	import CatalogFilters from '$lib/components/catalog/catalog-filters.svelte';
	import CatalogSort from '$lib/components/catalog/catalog-sort.svelte';
	import CategoryGrid from '$lib/components/catalog/category-grid.svelte';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import { plural } from '$lib/plural';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import SlidersIcon from '@lucide/svelte/icons/sliders-horizontal';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let filtersOpen = $state(false);

	const title = $derived.by(() => {
		if (data.view === 'categories') return 'Каталог';
		if (data.category) return data.category.name;
		if (data.filters.query) return `Пошук: ${data.filters.query}`;
		if (data.filters.sale) return 'Знижки';
		return 'Товари';
	});

	function pageUrl(target: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(pageState.url.searchParams);
		params.set('page', String(target));
		return `${pageState.url.pathname}?${params}`;
	}

	function totalLabel(total: number) {
		return `${total} ${plural(total, 'товар', 'товари', 'товарів')}`;
	}
</script>

<PageMeta
	title={data.seo.title}
	description={data.seo.description}
	canonical={data.seo.canonical}
	index={data.seo.index}
/>

<div class="mx-auto max-w-6xl px-4 py-10">
	<!-- Крихти — список: так їх читає скрінрідер і так їх очікує розмітка. -->
	<nav aria-label="Хлібні крихти" class="mb-6 text-sm text-muted-foreground">
		<ol class="flex flex-wrap items-center gap-2">
			<li><a href="/" class="hover:text-foreground">Головна</a></li>
			<li aria-hidden="true">/</li>
			{#if data.view === 'products' && data.category}
				<li><a href="/catalog" class="hover:text-foreground">Каталог</a></li>
				<li aria-hidden="true">/</li>
				<li class="text-foreground" aria-current="page">{data.category.name}</li>
			{:else}
				<li class="text-foreground" aria-current="page">Каталог</li>
			{/if}
		</ol>
	</nav>

	{#if data.view === 'categories'}
		<header class="mb-10">
			<h1 class="font-heading text-4xl">Каталог</h1>
			<p class="mt-2 text-sm text-muted-foreground">Оберіть категорію</p>
		</header>

		<CategoryGrid categories={data.categories} />
	{:else}
		{@const activeFilters = data.filters.sizes.length + data.filters.colors.length}
		<header class="mb-6 flex flex-wrap items-baseline justify-between gap-3">
			<h1 class="font-heading text-4xl">{title}</h1>
			<p class="text-sm text-muted-foreground tabular-nums">{totalLabel(data.total)}</p>
		</header>

		<!-- Панель керування: на телефоні фільтри ховаються в шторку, щоб не
		     висіти купою над сіткою; сортування лишається під рукою завжди. -->
		<div class="mb-8 no-scrollbar flex items-center gap-3 overflow-x-auto pb-1">
			<Sheet.Root bind:open={filtersOpen}>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm" class="shrink-0 lg:hidden">
							<SlidersIcon class="size-4" />
							Фільтри
							{#if activeFilters > 0}
								<span
									class="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background tabular-nums"
								>
									{activeFilters}
								</span>
							{/if}
						</Button>
					{/snippet}
				</Sheet.Trigger>

				<Sheet.Content side="bottom" class="max-h-[85vh] rounded-t-2xl p-0">
					<Sheet.Header class="p-6 pb-4">
						<Sheet.Title>Фільтри</Sheet.Title>
					</Sheet.Header>
					<!-- min-h-0 обов'язковий: без нього flex-колонка не дає блоку
					     стиснутись, і прокрутка йде на всю шторку. -->
					<div class="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
						<CatalogFilters
							facets={data.facets}
							sizes={data.filters.sizes}
							colors={data.filters.colors}
						/>
					</div>
					<Sheet.Footer class="p-6">
						<Button onclick={() => (filtersOpen = false)}>
							Показати {totalLabel(data.total)}
						</Button>
					</Sheet.Footer>
				</Sheet.Content>
			</Sheet.Root>

			<div class="ml-auto shrink-0">
				<CatalogSort sort={data.filters.sort} />
			</div>
		</div>

		<div class="grid gap-10 lg:grid-cols-[176px_1fr]">
			<aside class="hidden lg:sticky lg:top-24 lg:block lg:self-start">
				<CatalogFilters
					facets={data.facets}
					sizes={data.filters.sizes}
					colors={data.filters.colors}
				/>
			</aside>

			<div>
				{#if data.items.length === 0}
					<div class="rounded-lg border border-dashed py-24 text-center">
						<p class="font-heading text-xl">Нічого не знайшли</p>
						<p class="mt-2 text-sm text-muted-foreground">
							Спробуйте прибрати частину фільтрів або подивитись інші категорії.
						</p>
						<Button href="/catalog" variant="outline" class="mt-6">До категорій</Button>
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
	{/if}
</div>
