<script lang="ts">
	import { discountPercent, formatPrice } from '$lib/money';
	import Clock from '$lib/components/wheel/clock.svelte';
	import type { ActivePrize } from '$lib/types';
	import { prizeDiscount } from '$lib/wheel';
	import GiftIcon from '@lucide/svelte/icons/gift';
	import TruckIcon from '@lucide/svelte/icons/truck';

	/**
	 * Приз із колеса під ціною товару — розписаний по рядках, щоб було
	 * видно, звідки взялась ціна: звичайна ціна → знижка магазину (якщо
	 * річ в акції) → плюс приз → скільки разом заощаджуєте. І таймер: приз
	 * згорить, а ця ціна — разом із ним.
	 *
	 * Ціни магазину — з бази (`finalPrice`), тут лише знижка приза
	 * (`prizeDiscount`, та сама, що потрапить у замовлення).
	 */
	let {
		prize,
		/** Ціна, яку платять без приза: `finalPrice` обраного варіанта. */
		price,
		/** Ціна до знижки магазину, якщо річ в акції. */
		compareAt = null
	}: { prize: ActivePrize; price: number; compareAt?: number | null } = $props();

	const off = $derived(prizeDiscount(prize, price));
	const base = $derived(compareAt && compareAt > price ? compareAt : price);
	const saleOff = $derived(base - price);
	const salePercent = $derived(discountPercent(price, compareAt));
	const saved = $derived(base - price + off);
	const savedPercent = $derived(discountPercent(price - off, base));

	let now = $state<number | null>(null);

	$effect(() => {
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const left = $derived(now === null ? null : new Date(prize.expiresAt).getTime() - now);
</script>

{#if left === null || left > 0}
	<div
		data-slot="prize-offer"
		class="mt-4 overflow-hidden rounded-2xl border border-brand/40 bg-brand-soft/50"
	>
		<p class="flex items-center gap-2 bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">
			{#if prize.freeDelivery}
				<TruckIcon class="size-4 shrink-0" aria-hidden="true" />
				Ваш приз: безкоштовна доставка
			{:else}
				<GiftIcon class="size-4 shrink-0" aria-hidden="true" />
				Ваш приз з колеса: −{prize.percent}%
			{/if}
			<span class="ml-auto shrink-0 text-xs opacity-90">ще <Clock {left} /></span>
		</p>

		{#if off > 0}
			<dl class="space-y-1.5 px-4 py-3 text-sm">
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground">Звичайна ціна</dt>
					<dd class="tabular-nums">{formatPrice(base)}</dd>
				</div>
				{#if saleOff > 0}
					<div class="flex justify-between gap-3">
						<dt class="text-muted-foreground">
							Знижка магазину{salePercent ? ` −${Math.round(salePercent)}%` : ''}
						</dt>
						<dd class="text-sale tabular-nums">−{formatPrice(saleOff)}</dd>
					</div>
				{/if}
				<div class="flex justify-between gap-3 font-medium text-brand">
					<dt>{saleOff > 0 ? '+ ваш приз' : 'Ваш приз'} −{prize.percent}%</dt>
					<dd class="tabular-nums">−{formatPrice(off)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 border-t border-brand/30 pt-2">
					<dt class="font-semibold">Ви заощаджуєте</dt>
					<dd class="text-lg font-semibold text-sale tabular-nums">
						{formatPrice(saved)}{#if savedPercent}
							<span class="ml-1 text-sm font-medium">(−{Math.round(savedPercent)}%)</span>
						{/if}
					</dd>
				</div>
			</dl>
		{:else}
			<p class="px-4 py-3 text-sm">
				Доставку цього замовлення оплатимо ми.
				{#if saleOff > 0}
					А на цю річ ще й діє знижка — заощаджуєте {formatPrice(saleOff)}.
				{/if}
			</p>
		{/if}
	</div>
{/if}
