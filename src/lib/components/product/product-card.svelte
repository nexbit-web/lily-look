<script lang="ts">
	import { discountPercent, formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { ProductCard } from '$lib/types';

	let { product, priority = false }: { product: ProductCard; priority?: boolean } = $props();

	const discount = $derived(discountPercent(product.price, product.compareAt));
</script>

<a href="/product/{product.slug}" class="group block">
	<div class="relative aspect-3/4 overflow-hidden rounded-2xl bg-muted">
		{#if product.image}
			<img
				src={product.image.url}
				alt={product.image.alt}
				loading={priority ? 'eager' : 'lazy'}
				class="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
			/>
		{/if}

		{#if discount}
			<!-- Плашка без заливки: скло + рожевий текст читаються поверх
			     будь-якого фото, але не перекривають саму річ. -->
			<span
				class="absolute top-3 left-3 rounded-full bg-white/65 px-2.5 py-1 text-xs font-semibold text-sale ring-1 ring-sale/30 backdrop-blur-md"
			>
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
