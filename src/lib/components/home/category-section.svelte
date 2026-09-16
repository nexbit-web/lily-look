<script lang="ts">
	import SectionHeading from '$lib/components/home/section-heading.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import ProductGridSkeleton from '$lib/components/product/product-grid-skeleton.svelte';
	import { Button } from '$lib/components/ui/button';
	import { HOME_CATEGORY_LIMIT } from '$lib/config';
	import type { HomeSection, ProductCard } from '$lib/types';

	/**
	 * Стрічка однієї категорії на головній.
	 *
	 * Стрічку взагалі не малюють, поки покупець до неї не догортав (цим
	 * керує `category-feed`), тож картки можна просити одразу при появі:
	 * якщо блок з'явився — він уже майже в кадрі.
	 */
	let { section }: { section: HomeSection } = $props();

	/** Те, що довантажили самі; те, що прийшло з сервером, лежить у пропсах. */
	let fetched = $state<ProductCard[] | null>(null);
	let failed = $state(false);

	const products = $derived(section.products ?? fetched);
	const titleId = $derived(`section-${section.slug}`);
	/** Скільки клітинок малює заглушка — рівно стільки й приїде карток. */
	const placeholders = $derived(Math.min(section.productCount, HOME_CATEGORY_LIMIT));
	const hasMore = $derived(section.productCount > (products?.length ?? placeholders));

	$effect(() => {
		if (section.products) return;

		const slug = section.slug;
		let cancelled = false;

		(async () => {
			try {
				const response = await fetch(`/api/category/${encodeURIComponent(slug)}`);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const payload = (await response.json()) as { products: ProductCard[] };
				if (!cancelled) fetched = payload.products;
			} catch {
				// Не дістали товари — лишаємо заголовок і посилання на категорію:
				// дорога до речей є, просто довша.
				if (!cancelled) failed = true;
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<section class="mx-auto max-w-6xl px-4 py-8 md:py-10" aria-labelledby={titleId}>
	<SectionHeading
		title={section.name}
		{titleId}
		link={{ label: 'Уся категорія', href: `/catalog/${section.slug}` }}
	/>

	{#if products}
		<ProductGrid {products} />
	{:else if failed}
		<p class="text-sm text-muted-foreground">
			Не вдалося завантажити речі цієї категорії.
			<a href="/catalog/{section.slug}" class="underline underline-offset-4">Відкрити категорію</a>
		</p>
	{:else}
		<!-- Поки картки в дорозі, місце під них уже зайняте заглушкою —
		     сторінка не смикається, коли вони приїдуть. -->
		<div role="status" aria-label="Завантажуємо речі категорії {section.name}">
			<ProductGridSkeleton count={placeholders} />
		</div>
	{/if}

	{#if hasMore}
		<!-- На телефоні посилання із заголовка сховане, тож вихід у категорію
		     потрібен ще й тут — і він єдиний, коли JS вимкнено. -->
		<div class="mt-6 flex justify-center">
			<Button href="/catalog/{section.slug}" variant="outline">Дивитись усю категорію</Button>
		</div>
	{/if}
</section>
