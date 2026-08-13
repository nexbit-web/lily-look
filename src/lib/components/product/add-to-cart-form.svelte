<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import SizeChartDialog from '$lib/components/product/size-chart-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { SIZE_ORDER } from '$lib/config';
	import { discountPercent, formatPrice } from '$lib/money';
	import type { ProductDetail } from '$lib/types';
	import { cn } from '$lib/utils';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { untrack } from 'svelte';
	import toast from 'svelte-hot-french-toast';

	let { product }: { product: ProductDetail } = $props();

	/** Нижче цієї межі показуємо, скільки лишилось — це підштовхує до рішення. */
	const LOW_STOCK = 3;

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
	const soldOut = $derived(product.variants.every((variant) => variant.stock < 1));

	function chooseColor(color: string) {
		selectedColor = color;
		// Розмір міг бути доступний в іншому кольорі, але не в цьому.
		if (selectedSize && !variantFor(color, selectedSize)?.stock) selectedSize = '';
	}

	function label() {
		if (soldOut) return 'Немає в наявності';
		if (!selected) return 'Оберіть розмір';
		return 'Додати в кошик';
	}
</script>

<div class="space-y-8">
	<div>
		<a
			href="/catalog/{product.category.slug}"
			class="text-xs tracking-[0.15em] text-muted-foreground uppercase hover:text-foreground"
		>
			{product.category.name}
		</a>

		<h1 class="mt-3 font-heading text-3xl md:text-4xl">{product.name}</h1>

		<div class="mt-4 flex flex-wrap items-baseline gap-3">
			<span class="text-2xl tabular-nums">{formatPrice(price)}</span>
			{#if product.compareAt && product.compareAt > price}
				<span class="text-muted-foreground tabular-nums line-through">
					{formatPrice(product.compareAt)}
				</span>
				<span
					class="rounded-full px-2 py-0.5 text-xs font-semibold text-sale ring-1 ring-sale/30 ring-inset"
				>
					−{discount}%
				</span>
			{/if}
		</div>
	</div>

	<form
		method="POST"
		action="?/add"
		class="space-y-7"
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

		{#if colors.length > 1}
			<fieldset class="space-y-3">
				<legend class="text-xs tracking-[0.15em] uppercase">
					Колір: <span class="text-muted-foreground">{selectedColor}</span>
				</legend>
				<div class="flex flex-wrap gap-2.5">
					{#each colors as color (color.name)}
						{@const active = selectedColor === color.name}
						<button
							type="button"
							onclick={() => chooseColor(color.name)}
							aria-pressed={active}
							title={color.name}
							class={cn(
								'flex size-9 cursor-pointer items-center justify-center rounded-full ring-1 ring-foreground/15 transition-all',
								active && 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
							)}
							style={color.hex ? `background-color: ${color.hex}` : undefined}
						>
							{#if active}
								<CheckIcon class="size-3.5 text-white mix-blend-difference" />
							{/if}
							<span class="sr-only">{color.name}</span>
						</button>
					{/each}
				</div>
			</fieldset>
		{/if}

		<fieldset class="space-y-3">
			<div class="flex items-center justify-between gap-4">
				<legend class="text-xs tracking-[0.15em] uppercase">Розмір</legend>
				<SizeChartDialog categorySlug={product.category.slug} {selectedSize} />
			</div>

			{#if sizes.length === 0}
				<!-- Розміри без залишку сюди не доїжджають узагалі, тож порожній
				     список означає рівно одне: модель розібрали. -->
				<p class="text-sm text-muted-foreground">
					Усі розміри розібрали. Модель повернеться в наявність — з'явиться й вибір.
				</p>
			{:else}
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
								'h-11 min-w-14 cursor-pointer rounded-md  border px-3 text-sm transition-colors',
								selectedSize === size
									? 'border-foreground bg-foreground text-background'
									: 'hover:border-foreground/40',
								!available &&
									'cursor-not-allowed border-dashed text-muted-foreground/60 line-through hover:border-border'
							)}
						>
							{size}
						</button>
					{/each}
				</div>
			{/if}

			<p class="min-h-5 text-xs text-brand">
				{#if selected && selected.stock <= LOW_STOCK}
					Залишилось {selected.stock} шт. — устигніть
				{/if}
			</p>
		</fieldset>

		<div class="space-y-3">
			<!--
				Заливка кнопки — фонова картинка з background-position: center.
				На наведення її ширина йде в нуль, тож колір стискається з обох
				боків до середини, лишаючи рамку й текст того ж кольору.
				`enabled:` — щоб вимкнена кнопка не «роздягалась» під курсором.
			-->
			<Button
				type="submit"
				size="lg"
				class="h-14 w-full rounded-md border-2 border-[#53af01] bg-transparent bg-[linear-gradient(#53af01,#53af01)] bg-[length:100%_100%] bg-center bg-no-repeat text-xl duration-500 hover:bg-transparent enabled:hover:bg-[length:0%_100%] enabled:hover:text-[#53af01]"
				disabled={!selected || submitting || soldOut}
			>
				{#if submitting}
					<Spinner />
				{/if}
				{label()}
			</Button>

			<p class="text-center text-[0.7rem] tracking-[0.12em] text-muted-foreground uppercase">
				Оплата при отриманні · Обмін 14 днів
			</p>
		</div>
	</form>
</div>
