<script lang="ts">
	import ProductCard from '$lib/components/product/product-card.svelte';
	import type { ProductCard as ProductCardData } from '$lib/types';

	let { products }: { products: ProductCardData[] } = $props();
</script>

<div class="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
	{#each products as product, index (product.id)}
		<ProductCard {product} priority={index < 4} />
	{/each}
</div>
