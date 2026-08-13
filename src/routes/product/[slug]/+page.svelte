<script lang="ts">
	import { page } from '$app/state';
	import { reveal } from '$lib/actions/reveal';
	import AddToCartForm from '$lib/components/product/add-to-cart-form.svelte';
	import ProductGallery from '$lib/components/product/product-gallery.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { SITE } from '$lib/config';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const product = $derived(data.product);
	const cover = $derived(product.images[0]?.url ?? '');
	const summary = $derived(product.description.slice(0, 160));
</script>

<svelte:head>
	<title>{product.name} — {SITE.name}</title>
	<meta name="description" content={summary} />
	<link rel="canonical" href={page.url.href} />

	<meta property="og:type" content="product" />
	<meta property="og:title" content="{product.name} — {SITE.name}" />
	<meta property="og:description" content={summary} />
	{#if cover}
		<meta property="og:image" content={cover} />
	{/if}
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<nav
		aria-label="Хлібні крихти"
		class="mb-8 flex flex-wrap items-center gap-2 text-xs tracking-[0.08em] text-muted-foreground uppercase"
	>
		<a href="/" class="transition-colors hover:text-foreground">Головна</a>
		<span aria-hidden="true">/</span>
		<a href="/catalog" class="transition-colors hover:text-foreground">Каталог</a>
		<span aria-hidden="true">/</span>
		<a href="/catalog/{product.category.slug}" class="transition-colors hover:text-foreground">
			{product.category.name}
		</a>
		<span aria-hidden="true">/</span>
		<span class="text-foreground">{product.name}</span>
	</nav>

	<!-- Галерея має фіксовану ширину (466px + мініатюри), решта — під форму -->
	<div class="grid gap-10 lg:grid-cols-[auto_1fr] lg:gap-14">
		<!-- key: при переході на інший товар вибір кольору/розміру має скинутись -->
		{#key product.id}
			<ProductGallery images={product.images} name={product.name} />
			<AddToCartForm {product} />
		{/key}
	</div>

	<!-- Опис на всю ширину під галереєю: у колонці з формою він заважав
	     головному — вибрати розмір і купити. -->
	<section class="mt-16 border-t pt-12">
		<h2 class="font-heading text-2xl">Опис</h2>
		<p class="mt-5 max-w-2xl leading-relaxed text-muted-foreground">{product.description}</p>
	</section>

	{#if data.recommended.length}
		<section class="mt-24" use:reveal>
			<div class="mb-8 flex items-baseline justify-between gap-4">
				<h2 class="font-heading text-2xl">Вам також сподобається</h2>
				<a
					href="/catalog/{product.category.slug}"
					class="text-xs tracking-[0.15em] text-muted-foreground uppercase transition-colors hover:text-foreground"
				>
					Уся категорія
				</a>
			</div>
			<ProductGrid products={data.recommended} />
		</section>
	{/if}
</div>
