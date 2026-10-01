<script lang="ts">
	import FortuneWheel from '$lib/components/wheel/fortune-wheel.svelte';
	import WheelResult from '$lib/components/wheel/wheel-result.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { ActivePrize } from '$lib/types';
	import XIcon from '@lucide/svelte/icons/x';
	import { fade } from 'svelte/transition';

	/**
	 * Вікно з колесом для нового відвідувача. Коли його показати, вирішує
	 * шар (`+layout.svelte`). Тексту мінімум: заголовок, рядок, колесо —
	 * а після оберту лише сам результат.
	 */
	let {
		open = $bindable(false),
		onclose
	}: {
		open?: boolean;
		/** Вікно закрили — більше не показуємо (кука `lily_wheel`). */
		onclose?: () => void;
	} = $props();

	let won = $state<ActivePrize | null>(null);

	/**
	 * Колесо й результат різної висоти. Вікно стоїть по центру екрана, тож
	 * без підготовки воно стрибало б: раз — і вже інший розмір. Тому висота
	 * пливе від однієї до іншої (`transition` на `height`), а приз
	 * проявляється, а не вискакує.
	 */
	let innerHeight = $state(0);
</script>

<Dialog.Root
	bind:open
	onOpenChange={(value) => {
		if (!value) onclose?.();
	}}
>
	<Dialog.Content
		data-slot="wheel-dialog"
		showCloseButton={false}
		class="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-3xl px-6 pt-10 pb-6 sm:max-w-sm"
	>
		<Dialog.Close
			class="absolute top-3 right-3 flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
		>
			<XIcon class="size-5" aria-hidden="true" />
			<span class="sr-only">Закрити</span>
		</Dialog.Close>

		<!-- Ширше за вміст на ширину полів: тінь колеса не обрізається. -->
		<div
			class="-mx-6 overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
			style:height={innerHeight ? `${innerHeight}px` : undefined}
		>
			<div bind:offsetHeight={innerHeight} class="px-6">
				{#if won}
					<div in:fade={{ duration: 400, delay: 120 }}>
						<WheelResult prize={won} celebrate onclose={() => (open = false)} />
					</div>
				{:else}
					<Dialog.Header class="items-center gap-1 text-center">
						<Dialog.Title class="font-heading text-3xl font-normal normal-case">
							Подарунок новому клієнту
						</Dialog.Title>
						<Dialog.Description class="sr-only">Колесо знижок</Dialog.Description>
					</Dialog.Header>

					<div class="mt-6">
						<FortuneWheel onresult={(prize) => (won = prize)} onclose={() => (open = false)} />
					</div>
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
