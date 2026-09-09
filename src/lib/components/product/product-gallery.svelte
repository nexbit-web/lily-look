<script lang="ts">
	import Lightbox from '$lib/components/product/lightbox.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { cn } from '$lib/utils';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ExpandIcon from '@lucide/svelte/icons/expand';

	let { images, name }: { images: { url: string; alt: string }[]; name: string } = $props();

	/** Свайп по головному фото — щоб на телефоні не тягтись до мініатюр. */
	const SWIPE_THRESHOLD = 50;

	let index = $state(0);
	let lightboxOpen = $state(false);

	const active = $derived(images[index]);
	const many = $derived(images.length > 1);

	// Які фото вже завантажились: інакше при поверненні до фото
	// скелетон блимав би вдруге.
	const shown = $state<Record<string, boolean>>({});

	let track = $state<HTMLElement | null>(null);
	let dragX = $state(0);
	let dragging = $state(false);
	let startX = 0;
	let moved = false;

	// Фото з кешу встигають завантажитись до гідратації — onload уже не буде.
	$effect(() => {
		if (!track) return;
		for (const image of track.querySelectorAll('img')) {
			if (image.complete) shown[image.src] = true;
		}
	});

	function go(delta: number) {
		if (!many) return;
		index = (index + delta + images.length) % images.length;
	}

	function pointerdown(event: PointerEvent) {
		if (!many || event.button !== 0) return;
		dragging = true;
		moved = false;
		startX = event.clientX;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function pointermove(event: PointerEvent) {
		if (!dragging) return;
		dragX = event.clientX - startX;
		if (Math.abs(dragX) > 8) moved = true;
	}

	function pointerup() {
		if (!dragging) return;
		dragging = false;

		if (Math.abs(dragX) > SWIPE_THRESHOLD) go(dragX < 0 ? 1 : -1);
		dragX = 0;
	}
</script>

<div class="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
	{#if many}
		<div
			class="no-scrollbar flex shrink-0 gap-2 overflow-x-auto max-sm:px-4 sm:flex-col sm:overflow-visible"
		>
			{#each images as image, position (image.url)}
				<button
					type="button"
					onclick={() => (index = position)}
					aria-label="Фото {position + 1}"
					aria-current={position === index}
					class={cn(
						'aspect-4/5 w-12 shrink-0 cursor-pointer overflow-hidden bg-muted transition-opacity sm:w-16',
						position === index
							? 'ring-1 ring-foreground ring-offset-2 ring-offset-background'
							: 'opacity-55 hover:opacity-100'
					)}
				>
					<img src={image.url} alt="" class="size-full object-cover" loading="lazy" />
				</button>
			{/each}
		</div>
	{/if}

	<!-- Фото займає всю ширину колонки: чим більше воно, тим краще продає.
	     Пропорція 4:5 фіксована, тож висота не стрибає при завантаженні. -->
	<div class="group relative aspect-4/5 w-full min-w-0 flex-1 overflow-hidden bg-muted">
		{#if active && !shown[active.url]}
			<Skeleton class="absolute inset-0 size-full rounded-none" />
		{/if}

		<!-- Стрічка кадрів: перемикання — це зсув, а не підміна картинки -->
		<div
			bind:this={track}
			class={cn(
				'flex h-full w-full',
				!dragging && 'transition-transform duration-500 ease-out motion-reduce:transition-none'
			)}
			style="transform: translate3d(calc({-index * 100}% + {dragX}px), 0, 0)"
		>
			{#each images as image (image.url)}
				<img
					src={image.url}
					alt={image.alt || name}
					draggable="false"
					loading={image.url === images[0]?.url ? 'eager' : 'lazy'}
					fetchpriority={image.url === images[0]?.url ? 'high' : undefined}
					onload={() => (shown[image.url] = true)}
					class="size-full shrink-0 object-cover select-none"
				/>
			{/each}
		</div>

		<button
			type="button"
			onclick={() => {
				// Свайп теж закінчується кліком — але відкривати фото він не має.
				if (!moved) lightboxOpen = true;
			}}
			onpointerdown={pointerdown}
			onpointermove={pointermove}
			onpointerup={pointerup}
			onpointercancel={() => (dragging = false)}
			aria-label="Відкрити фото на весь екран"
			class="absolute inset-0 cursor-zoom-in touch-pan-y"
		></button>

		{#if many}
			<button
				type="button"
				onclick={() => go(-1)}
				aria-label="Попереднє фото"
				class="absolute top-1/2 left-3 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:hidden"
			>
				<ChevronLeftIcon class="size-4" />
			</button>
			<button
				type="button"
				onclick={() => go(1)}
				aria-label="Наступне фото"
				class="absolute top-1/2 right-3 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:hidden"
			>
				<ChevronRightIcon class="size-4" />
			</button>

			<span
				class="pointer-events-none absolute bottom-4 left-4 rounded-full bg-background/80 px-2.5 py-1 text-xs tabular-nums backdrop-blur sm:hidden"
			>
				{index + 1} / {images.length}
			</span>
		{/if}

		<span
			class="pointer-events-none absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-xs opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 max-sm:hidden"
		>
			<ExpandIcon class="size-3.5" />
			На весь екран
		</span>
	</div>
</div>

<Lightbox {images} {name} bind:open={lightboxOpen} bind:index />
