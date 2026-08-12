<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import AddToCartForm from '$lib/components/product/add-to-cart-form.svelte';
	import ProductGallery from '$lib/components/product/product-gallery.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { SITE } from '$lib/config';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.product.name} — {SITE.name}</title>
	<meta name="description" content={data.product.description.slice(0, 160)} />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<nav class="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
		<a href="/" class="hover:text-foreground">Головна</a>
		<span>/</span>
		<a href="/catalog" class="hover:text-foreground">Каталог</a>
		<span>/</span>
		<a href="/catalog/{data.product.category.slug}" class="hover:text-foreground">
			{data.product.category.name}
		</a>
	</nav>

	<div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
		<!-- key: при переході на інший товар вибір кольору/розміру має скинутись -->
		{#key data.product.id}
			<ProductGallery images={data.product.images} name={data.product.name} />
			<AddToCartForm product={data.product} />
		{/key}
	</div>

	{#if data.recommended.length}
		<section class="mt-24" use:reveal>
			<h2 class="mb-8 font-heading text-2xl">Вам також сподобається</h2>
			<ProductGrid products={data.recommended} />
		</section>
	{/if}
</div>
