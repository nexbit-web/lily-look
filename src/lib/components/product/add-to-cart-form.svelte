<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import SizeChartDialog from '$lib/components/product/size-chart-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { SIZE_ORDER } from '$lib/config';
	import { discountPercent, formatPrice } from '$lib/money';
	import type { ProductDetail } from '$lib/types';
	import { cn } from '$lib/utils';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import { untrack } from 'svelte';
	import toast from 'svelte-hot-french-toast';

	let { product }: { product: ProductDetail } = $props();

	// Унікальні кольори в порядку появи — варіантів на товар одиниці,
	// тож findIndex дешевший за додаткову структуру даних.
	const colors = $derived(
		product.variants
			.filter(
				(variant, index) =>
					product.variants.findIndex((other) => other.color === variant.color) === index
			)
			.map((variant) => ({ name: variant.color, hex: variant.colorHex }))
	);

	const sizes = $derived.by(() => {
		const order = SIZE_ORDER as readonly string[];
		return [...new Set(product.variants.map((variant) => variant.size))].sort(
			(a, b) => order.indexOf(a) - order.indexOf(b)
		);
	});

	// Початковий колір беремо один раз: подальші зміни `product` означають
	// перехід на інший товар, а там компонент перемонтовується через {#key}.
	let selectedColor = $state(untrack(() => product.variants[0]?.color ?? ''));
	let selectedSize = $state('');
	let submitting = $state(false);

	const variantFor = (color: string, size: string) =>
		product.variants.find((variant) => variant.color === color && variant.size === size);

	const selected = $derived(variantFor(selectedColor, selectedSize));
	const price = $derived(selected?.price ?? product.price);
	const discount = $derived(discountPercent(price, product.compareAt));

	function chooseColor(color: string) {
		selectedColor = color;
		// Розмір міг бути доступний в іншому кольорі, але не в цьому.
		if (selectedSize && !variantFor(color, selectedSize)?.stock) selectedSize = '';
	}
</script>

<div class="space-y-8">
	<div>
		<a
			href="/catalog/{product.category.slug}"
			class="text-xs tracking-[0.15em] text-muted-foreground uppercase hover:underline"
		>
			{product.category.name}
		</a>
		<h1 class="mt-2 font-heading text-3xl md:text-4xl">{product.name}</h1>

		<div class="mt-4 flex items-baseline gap-3">
			<span class="text-2xl">{formatPrice(price)}</span>
			{#if product.compareAt && product.compareAt > price}
				<span class="text-muted-foreground line-through">{formatPrice(product.compareAt)}</span>
				<span class="text-sm font-semibold text-sale">−{discount}%</span>
			{/if}
		</div>
	</div>

	<form
		method="POST"
		action="?/add"
		class="space-y-8"
		use:enhance={() => {
			submitting = true;
			return async ({ result }) => {
				submitting = false;

				if (result.type === 'success') {
					toast.success('Додано в кошик');
					// Оновлюємо лічильник у шапці, не перезавантажуючи сторінку.
					await invalidateAll();
					return;
				}
				if (result.type === 'failure') {
					toast.error(String(result.data?.message ?? 'Не вдалося додати товар'));
					return;
				}
				toast.error('Щось пішло не так. Спробуйте ще раз.');
			};
		}}
	>
		<input type="hidden" name="variantId" value={selected?.id ?? ''} />

		<fieldset class="space-y-3">
			<legend class="text-xs tracking-[0.15em] uppercase">
				Колір: <span class="text-muted-foreground">{selectedColor}</span>
			</legend>
			<div class="flex flex-wrap gap-2">
				{#each colors as color (color.name)}
					<button
						type="button"
						onclick={() => chooseColor(color.name)}
						aria-pressed={selectedColor === color.name}
						class={cn(
							'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
							selectedColor === color.name ? 'border-foreground' : 'hover:border-muted-foreground'
						)}
					>
						{#if color.hex}
							<span
								class="size-4 rounded-full border"
								style="background-color: {color.hex}"
								aria-hidden="true"
							></span>
						{/if}
						{color.name}
					</button>
				{/each}
			</div>
		</fieldset>

		<fieldset class="space-y-3">
			<div class="flex items-center justify-between gap-4">
				<legend class="text-xs tracking-[0.15em] uppercase">Розмір</legend>
				<SizeChartDialog categorySlug={product.category.slug} {selectedSize} />
			</div>

			<div class="flex flex-wrap gap-2">
				{#each sizes as size (size)}
					{@const variant = variantFor(selectedColor, size)}
					{@const available = (variant?.stock ?? 0) > 0}
					<button
						type="button"
						disabled={!available}
						onclick={() => (selectedSize = size)}
						aria-pressed={selectedSize === size}
						class={cn(
							'min-w-12 rounded-md border px-3 py-2 text-sm transition-colors',
							selectedSize === size && 'border-foreground bg-foreground text-background',
							!available && 'cursor-not-allowed text-muted-foreground line-through opacity-50'
						)}
					>
						{size}
					</button>
				{/each}
			</div>

			{#if selected && selected.stock <= 3}
				<p class="text-sm text-brand">Залишилось {selected.stock} шт.</p>
			{/if}
		</fieldset>

		<Button
			type="submit"
			size="lg"
			class="w-full rounded-[3px] bg-brand text-success-foreground hover:bg-brand/90"
			disabled={!selected || submitting}
		>
			{#if submitting}
				<LoaderIcon class="animate-spin" />
			{/if}
			{selected ? 'Купити' : 'Оберіть розмір'}
		</Button>
	</form>

	<div class="prose prose-sm max-w-none prose-stone dark:prose-invert">
		<p>{product.description}</p>
	</div>
</div>
