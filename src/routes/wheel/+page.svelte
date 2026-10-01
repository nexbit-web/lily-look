<script lang="ts">
	import FortuneWheel from '$lib/components/wheel/fortune-wheel.svelte';
	import WheelResult from '$lib/components/wheel/wheel-result.svelte';
	import type { ActivePrize } from '$lib/types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * Без JS результат приходить відповіддю форми, з JS — після зупинки
	 * колеса. Чинний приз із даних шару — для того, хто вже крутив.
	 */
	let spun = $state<ActivePrize | null>(null);
	const prize = $derived(spun ?? (form?.prize as ActivePrize | null | undefined) ?? data.prize);
</script>

<svelte:head>
	<title>Колесо знижок — LILY LOOK</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-sm px-4 py-12 text-center">
	{#if prize}
		<WheelResult {prize} celebrate={!!spun} href="/collection/winter" />
	{:else if data.wheelEligible}
		<h1 class="font-heading text-3xl">Подарунок новому клієнту</h1>
		<div class="mt-8">
			<FortuneWheel onresult={(value) => (spun = value)} />
		</div>
	{:else}
		<h1 class="font-heading text-3xl">Колесо знижок</h1>
		<p class="mt-3 text-sm text-muted-foreground">Колесо можна крутити лише один раз.</p>
	{/if}
</div>
