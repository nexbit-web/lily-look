<script lang="ts">
	import Clock from '$lib/components/wheel/clock.svelte';
	import type { ActivePrize } from '$lib/types';
	import GiftIcon from '@lucide/svelte/icons/gift';

	/**
	 * Смужка над шапкою, поки діє виграний приз: що виграно й скільки ще
	 * діє. Таймер — найсильніший нагадувач, що приз згорить.
	 *
	 * Час рахується лише в браузері (`Clock`): поки його немає, на місці
	 * цифр скелетон тієї ж ширини, тож рядок не стрибає.
	 */
	let { prize, cartCount = 0 }: { prize: ActivePrize; cartCount?: number } = $props();

	let now = $state<number | null>(null);

	$effect(() => {
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const left = $derived(now === null ? null : new Date(prize.expiresAt).getTime() - now);
</script>

{#if left === null || left > 0}
	<a
		href={cartCount > 0 ? '/cart' : '/collection/winter'}
		data-slot="prize-bar"
		class="block bg-foreground px-4 py-2 text-center text-xs text-background sm:text-sm"
	>
		<GiftIcon class="mr-1.5 inline size-4 -translate-y-px text-brand" aria-hidden="true" />
		Ваш приз: <span class="font-semibold">{prize.label}</span>
		<span class="opacity-70">· діє ще</span>
		<span class="font-semibold"><Clock {left} /></span>
	</a>
{/if}
