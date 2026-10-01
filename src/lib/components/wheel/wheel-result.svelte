<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Confetti from '$lib/components/wheel/confetti.svelte';
	import { WHEEL_PRIZE_HOURS } from '$lib/config';
	import { plural } from '$lib/plural';
	import type { ActivePrize } from '$lib/types';
	import GiftIcon from '@lucide/svelte/icons/gift';
	import TimerIcon from '@lucide/svelte/icons/timer';

	/**
	 * Що виграно — коротко: сам приз великим, один рядок про те, що він
	 * діє сам (промокоду немає — приз прив'язаний до браузера й
	 * підставляється в замовлення), скільки діє — і кнопка до покупок.
	 */
	let {
		prize,
		/** Кнопка під результатом: у вікні закриває його, на сторінці — веде до курток. */
		onclose,
		href,
		/** Приз щойно виграно — конфеті й «вистрибування». Для того, хто повернувся, — тихо. */
		celebrate = false
	}: { prize: ActivePrize; onclose?: () => void; href?: string; celebrate?: boolean } = $props();

	const hours = `${WHEEL_PRIZE_HOURS} ${plural(WHEEL_PRIZE_HOURS, 'годину', 'години', 'годин')}`;
	const pop = $derived(celebrate ? 'animate-in fade-in zoom-in-50 duration-500 ease-out' : '');
</script>

{#if celebrate}
	<Confetti />
{/if}

<div data-slot="wheel-result" class="flex flex-col items-center text-center">
	<span
		class="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand {pop}"
	>
		<GiftIcon class="size-7" aria-hidden="true" />
	</span>
	<p class="mt-4 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
		Вітаємо! Ваш приз
	</p>

	<!-- Приз — рубленим жирним шрифтом: тонкий Playfair у великому «−7%»
	     читався гірше, ніж треба для головного числа вікна. -->
	{#if prize.freeDelivery}
		<p class="mt-2 text-3xl leading-tight font-extrabold tracking-tight text-balance {pop}">
			Безкоштовна доставка
		</p>
	{:else}
		<p
			class="mt-1 text-[5.5rem] leading-none font-extrabold tracking-tighter text-brand tabular-nums {pop}"
		>
			−{prize.percent}%
		</p>
	{/if}

	<p class="mt-3 text-sm text-balance text-muted-foreground">
		{prize.freeDelivery ? 'На будь-яке замовлення.' : 'На все, навіть на акційні речі.'}
		<span class="whitespace-nowrap">Бонус для вас.</span>
	</p>

	<p
		class="mt-5 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium"
	>
		<TimerIcon class="size-4 text-brand" aria-hidden="true" />
		Діє {hours}
	</p>

	<Button {href} onclick={onclose} size="lg" class="mt-6 h-12 w-full rounded-full text-base">
		Обрати річ
	</Button>
</div>
