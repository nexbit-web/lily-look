<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { FREE_DELIVERY_FROM, RETURN_DAYS } from '$lib/config';
	import { formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	let { subtotal, count }: { subtotal: number; count: number } = $props();

	const missing = $derived(FREE_DELIVERY_FROM - subtotal);
	const freeDelivery = $derived(missing <= 0);
	const progress = $derived(Math.min(100, (subtotal / FREE_DELIVERY_FROM) * 100));
</script>

<aside class="lg:sticky lg:top-24 lg:self-start">
	<div class="rounded-2xl bg-muted/40 p-7">
		<p class="text-[0.7rem] tracking-[0.22em] text-muted-foreground uppercase">Підсумок</p>

		<dl class="mt-6 space-y-3.5 text-sm">
			<div class="flex items-baseline justify-between gap-4">
				<dt class="text-muted-foreground">
					{count}
					{plural(count, 'товар', 'товари', 'товарів')}
				</dt>
				<dd class="tabular-nums">{formatPrice(subtotal)}</dd>
			</div>

			<div class="flex items-baseline justify-between gap-4">
				<dt class="text-muted-foreground">Доставка</dt>
				<dd class={freeDelivery ? 'text-success' : 'text-muted-foreground'}>
					{freeDelivery ? 'Безкоштовно' : 'Розрахуємо далі'}
				</dd>
			</div>
		</dl>

		<!-- Смужка потрібна, лише поки до безкоштовної доставки чогось бракує -->
		{#if !freeDelivery}
			<div class="mt-6 space-y-2">
				<Progress
					value={progress}
					class="h-0.75 overflow-hidden rounded-full bg-foreground/10 *:data-[slot=progress-indicator]:bg-brand"
				/>
				<p class="text-xs text-muted-foreground">
					Ще {formatPrice(missing)} — і доставка безкоштовна
				</p>
			</div>
		{/if}

		<div class="mt-7 flex items-end justify-between gap-4 border-t border-foreground/10 pt-6">
			<span class="text-[0.7rem] tracking-[0.22em] text-muted-foreground uppercase">До сплати</span>
			<span class="font-heading text-3xl leading-none tabular-nums">{formatPrice(subtotal)}</span>
		</div>

		<Button href="/checkout" size="lg" class="mt-6 w-full" disabled={count === 0}>
			Оформити замовлення
			<ArrowRightIcon />
		</Button>

		<p class="mt-4 text-center text-[0.7rem] tracking-[0.12em] text-muted-foreground uppercase">
			Оплата при отриманні · Обмін {RETURN_DAYS}
			{plural(RETURN_DAYS, 'день', 'дні', 'днів')}
		</p>
	</div>
</aside>
