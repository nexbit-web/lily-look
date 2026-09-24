<script lang="ts">
	import SectionHeading from '$lib/components/home/section-heading.svelte';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { Button } from '$lib/components/ui/button';
	import { plural } from '$lib/plural';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const models = (count: number) => `${count} ${plural(count, 'модель', 'моделі', 'моделей')}`;

	/** Перший ряд першої полиці — те, що видно одразу: його фото не відкладаємо. */
	const FIRST_ROW = 4;
</script>

<PageMeta
	title={data.seo.title}
	description={data.seo.description}
	canonical={data.seo.canonical}
	image={data.shelves[0]?.products[0]?.image?.url ?? null}
	index={data.seo.index}
/>

<div class="mx-auto max-w-6xl px-4 py-8 md:py-10">
	<nav aria-label="Хлібні крихти" class="mb-6 text-sm text-muted-foreground">
		<ol class="flex flex-wrap items-center gap-2">
			<li><a href="/" class="hover:text-foreground">Головна</a></li>
			<li aria-hidden="true">/</li>
			<li class="text-foreground" aria-current="page">{data.collection.name}</li>
		</ol>
	</nav>

	<header class="mb-8">
		<div class="flex flex-wrap items-baseline justify-between gap-3">
			<h1 class="font-heading text-4xl">{data.collection.name}</h1>
			<p class="text-sm text-muted-foreground tabular-nums">{models(data.total)}</p>
		</div>
		<p class="mt-3 max-w-2xl text-pretty">{data.collection.lead}</p>
		{#if data.intro}
			<p class="mt-3 max-w-3xl text-sm text-muted-foreground">{data.intro}</p>
		{/if}
	</header>

	{#if data.shelves.length > 1}
		<!-- Полиць кілька, а сторінка довга: переходи до потрібної без прокрутки. -->
		<nav aria-label="Розділи колекції" class="-mx-4 mb-12 no-scrollbar overflow-x-auto px-4">
			<ul class="flex gap-2">
				{#each data.shelves as shelf (shelf.slug)}
					<li class="shrink-0">
						<a
							href="#{shelf.slug}"
							class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors hover:bg-muted"
						>
							{shelf.name}
							<span class="text-muted-foreground tabular-nums">{shelf.products.length}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}

	{#if data.shelves.length === 0}
		<div class="py-16 text-center">
			<p class="text-muted-foreground">Колекцію розібрали. Нові моделі вже в дорозі.</p>
			<Button href="/catalog" class="mt-6">До каталогу</Button>
		</div>
	{/if}

	<div class="space-y-16 md:space-y-20">
		{#each data.shelves as shelf, shelfIndex (shelf.slug)}
			<section id={shelf.slug} class="scroll-mt-24" aria-labelledby="{shelf.slug}-heading">
				<SectionHeading
					eyebrow={models(shelf.products.length)}
					title={shelf.name}
					titleId="{shelf.slug}-heading"
					link={{ label: 'Уся категорія', href: `/catalog/${shelf.slug}` }}
				/>
				<ProductGrid products={shelf.products} priority={shelfIndex === 0 ? FIRST_ROW : 0} />
			</section>
		{/each}
	</div>
</div>
