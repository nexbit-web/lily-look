<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import ProductCard from '$lib/components/product/product-card.svelte';
	import type { ProductCard as ProductCardData } from '$lib/types';

	let { products }: { products: ProductCardData[] } = $props();

	/**
	 * Кожна картка з'являється сама, а не разом з усією сіткою: спостерігач
	 * висить на картці. Затримка йде хвилею по ряду (максимум чотири колонки),
	 * тож сусіди не спалахують одночасно.
	 */
	const STAGGER_MS = 70;
</script>

<!-- Сітка товарів — це список: пошуковик і скрінрідер бачать кількість
     позицій і межі кожної картки, а не абстрактні блоки. -->
<ul class="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 lg:grid-cols-4">
	{#each products as product, index (product.id)}
		<li use:reveal={{ delay: (index % 4) * STAGGER_MS }}>
			<ProductCard {product} priority={index < 4} />
		</li>
	{/each}
</ul>
