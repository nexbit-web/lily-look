<script lang="ts">
	import { discountPercent, formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { ProductCard } from '$lib/types';
	import { cn } from '$lib/utils';
	import TagIcon from '@lucide/svelte/icons/tag';

	let { product, priority = false }: { product: ProductCard; priority?: boolean } = $props();

	const discount = $derived(discountPercent(product.price, product.compareAt));
</script>

<a href="/product/{product.slug}" class="group block">
	<div class="relative aspect-4/5 overflow-hidden rounded-md bg-muted">
		{#if product.image}
			<img
				src={product.image.url}
				alt={product.image.alt}
				loading={priority ? 'eager' : 'lazy'}
				class={cn(
					'size-full object-cover transition-transform duration-700 ease-out motion-reduce:transition-none',
					// Без другого фото картка не має чим відповісти на наведення —
					// тоді лишаємо легкий зум.
					!product.hoverImage && 'group-hover:scale-105'
				)}
			/>
		{/if}

		{#if product.hoverImage}
			<!-- Друге фото лежить зверху й проявляється. Перше не гасимо: інакше
			     на середині переходу прозирав би фон картки. -->
			<img
				src={product.hoverImage.url}
				alt=""
				aria-hidden="true"
				loading="lazy"
				class="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 motion-reduce:transition-none"
			/>
		{/if}

		{#if discount}
			<span
				class="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-sale px-2 py-1 text-xs font-semibold text-white shadow-sm"
			>
				<TagIcon class="size-3.5" strokeWidth={2.25} aria-hidden="true" />
				−{discount}%
			</span>
		{/if}

		{#if !product.inStock}
			<div
				class="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
			>
				<span class="text-xs tracking-[0.15em] uppercase">Немає в наявності</span>
			</div>
		{/if}
	</div>

	<div class="mt-3 space-y-1">
		<h3 class="text-sm transition-colors group-hover:text-muted-foreground">{product.name}</h3>
		<p class="flex items-baseline gap-2">
			<span class="text-sm font-medium">{formatPrice(product.price)}</span>
			{#if product.compareAt && product.compareAt > product.price}
				<span class="text-xs text-muted-foreground line-through">
					{formatPrice(product.compareAt)}
				</span>
			{/if}
		</p>
		{#if product.colors.length > 1}
			<p class="text-xs text-muted-foreground">
				{product.colors.length}
				{plural(product.colors.length, 'колір', 'кольори', 'кольорів')}
			</p>
		{/if}
	</div>
</a>
