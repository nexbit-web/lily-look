<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import AddToCartForm from '$lib/components/product/add-to-cart-form.svelte';
	import ProductDescription from '$lib/components/product/product-description.svelte';
	import ProductGallery from '$lib/components/product/product-gallery.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { SITE } from '$lib/config';
	import { formatPrice } from '$lib/money';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const product = $derived(data.product);
	const cover = $derived(product.images[0]?.url ?? '');
	// Опис для видачі: перше речення товару плюс те, що вирішує покупця
	// на місці — наявність і умови доставки.
	const metaDescription = $derived(
		`${product.description.slice(0, 120).trim()} Ціна ${formatPrice(product.price)}. Доставка по Україні, обмін 14 днів.`
	);
</script>

<PageMeta
	title="{product.name} — купити в Україні | {SITE.name}"
	description={metaDescription}
	canonical="/product/{product.slug}"
	image={cover || null}
	type="product"
/>

<div class="mx-auto max-w-6xl px-4 py-10">
	<nav aria-label="Хлібні крихти" class="mb-8 text-xs tracking-[0.08em] uppercase">
		<ol class="flex flex-wrap items-center gap-2 text-muted-foreground">
			<li><a href="/" class="transition-colors hover:text-foreground">Головна</a></li>
			<li aria-hidden="true">/</li>
			<li><a href="/catalog" class="transition-colors hover:text-foreground">Каталог</a></li>
			<li aria-hidden="true">/</li>
			<li>
				<a href="/catalog/{product.category.slug}" class="transition-colors hover:text-foreground">
					{product.category.name}
				</a>
			</li>
			<li aria-hidden="true">/</li>
			<li class="text-foreground" aria-current="page">{product.name}</li>
		</ol>
	</nav>

	<!-- Галерея фіксованої ширини (466px + мініатюри), решта колонки — під форму -->
	<article class="grid gap-10 lg:grid-cols-[auto_1fr] lg:gap-14">
		<!-- key: при переході на інший товар вибір кольору/розміру має скинутись -->
		{#key product.id}
			<ProductGallery images={product.images} name={product.name} />

			<div class="space-y-8">
				<AddToCartForm {product} />
				<ProductDescription text={product.description} />
			</div>
		{/key}
	</article>

	{#if data.recommended.length}
		<section class="mt-24" aria-labelledby="recommended-heading">
			<div class="mb-8 flex items-baseline justify-between gap-4" use:reveal>
				<h2 id="recommended-heading" class="font-heading text-2xl">Вам також сподобається</h2>
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
