<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner';
	import { cn } from '$lib/utils';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog as DialogPrimitive } from 'bits-ui';

	/**
	 * Перегляд фото на весь екран.
	 *
	 * Свій, замість зовнішньої бібліотеки: тут потрібні рівно чотири речі —
	 * гортання, зум по кліку, свайп пальцем і закриття. Усе інше (портал,
	 * пастка фокуса, блокування скролу, Esc) уже вміє Dialog з bits-ui,
	 * на якому побудовані й компоненти shadcn.
	 */

	let {
		images,
		name,
		open = $bindable(false),
		index = $bindable(0)
	}: {
		images: { url: string; alt: string }[];
		name: string;
		open?: boolean;
		index?: number;
	} = $props();

	/** Наскільки далеко треба протягнути, щоб це вважалось гортанням. */
	const SWIPE_THRESHOLD = 60;
	const ZOOM_SCALE = 2.2;

	const current = $derived(images[index]);
	const many = $derived(images.length > 1);

	let zoomed = $state(false);
	let origin = $state('50% 50%');
	let loading = $state(true);

	let dragX = $state(0);
	let dragging = $state(false);
	let startX = 0;
	let moved = false;

	function go(delta: number) {
		if (!many) return;
		index = (index + delta + images.length) % images.length;
	}

	function show(next: number) {
		index = next;
	}

	// Зум і «завантажується» скидаються на кожному новому фото.
	$effect(() => {
		void index;
		zoomed = false;
		loading = true;
	});

	// Сусідні фото підвантажуємо заздалегідь — гортання без сірого кадру.
	$effect(() => {
		if (!open || !many) return;
		for (const offset of [-1, 1]) {
			const neighbour = images[(index + offset + images.length) % images.length];
			if (neighbour) new Image().src = neighbour.url;
		}
	});

	function onkeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'ArrowLeft') go(-1);
		if (event.key === 'ArrowRight') go(1);
	}

	function toggleZoom(event: MouseEvent) {
		// Клік після протягування — це кінець свайпу, а не намір зумити.
		if (moved) return;

		const target = event.currentTarget as HTMLElement;
		const box = target.getBoundingClientRect();
		origin = `${((event.clientX - box.left) / box.width) * 100}% ${((event.clientY - box.top) / box.height) * 100}%`;
		zoomed = !zoomed;
	}

	function pointerdown(event: PointerEvent) {
		if (zoomed || !many || event.button !== 0) return;
		dragging = true;
		moved = false;
		startX = event.clientX;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function pointermove(event: PointerEvent) {
		if (!dragging) return;
		dragX = event.clientX - startX;
		if (Math.abs(dragX) > 6) moved = true;
	}

	function pointerup() {
		if (!dragging) return;
		dragging = false;
		if (Math.abs(dragX) > SWIPE_THRESHOLD) go(dragX < 0 ? 1 : -1);
		dragX = 0;
	}
</script>

<svelte:window {onkeydown} />

<DialogPrimitive.Root bind:open>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-background/90 backdrop-blur-xl data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
		/>

		<DialogPrimitive.Content
			class="fixed inset-0 z-50 flex flex-col outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-98 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-98"
		>
			<DialogPrimitive.Title class="sr-only">{name} — фото на весь екран</DialogPrimitive.Title>
			<DialogPrimitive.Description class="sr-only">
				Гортайте стрілками або свайпом, клік по фото збільшує його.
			</DialogPrimitive.Description>

			<header class="flex items-center justify-between px-4 py-4 sm:px-6">
				<span class="text-xs tracking-[0.2em] text-muted-foreground tabular-nums uppercase">
					{#if many}{index + 1} / {images.length}{:else}{name}{/if}
				</span>

				<DialogPrimitive.Close
					class="flex size-10 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Закрити"
				>
					<XIcon class="size-5" />
				</DialogPrimitive.Close>
			</header>

			<div class="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-2 sm:px-16">
				<!-- Клік повз фото закриває: у лайтбоксі це очікувана поведінка -->
				<button
					type="button"
					onclick={() => (open = false)}
					aria-label="Закрити перегляд"
					class="absolute inset-0 cursor-zoom-out"
				></button>

				{#if loading}
					<Spinner class="pointer-events-none absolute size-6 text-muted-foreground" />
				{/if}

				{#if current}
					<img
						src={current.url}
						alt={current.alt || name}
						draggable="false"
						onload={() => (loading = false)}
						onclick={toggleZoom}
						onpointerdown={pointerdown}
						onpointermove={pointermove}
						onpointerup={pointerup}
						onpointercancel={pointerup}
						style="transform: translate3d({dragX}px, 0, 0) scale({zoomed
							? ZOOM_SCALE
							: 1}); transform-origin: {origin};"
						class={cn(
							'relative max-h-full max-w-full touch-pan-y rounded-xl object-contain select-none',
							zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
							loading && 'opacity-0',
							!dragging && 'transition-transform duration-300 ease-out motion-reduce:transition-none'
						)}
					/>
				{/if}

				{#if many}
					<button
						type="button"
						onclick={() => go(-1)}
						aria-label="Попереднє фото"
						class="absolute left-1 flex size-11 cursor-pointer items-center justify-center rounded-full bg-background/70 text-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur transition-colors hover:bg-background sm:left-4"
					>
						<ChevronLeftIcon class="size-5" />
					</button>
					<button
						type="button"
						onclick={() => go(1)}
						aria-label="Наступне фото"
						class="absolute right-1 flex size-11 cursor-pointer items-center justify-center rounded-full bg-background/70 text-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur transition-colors hover:bg-background sm:right-4"
					>
						<ChevronRightIcon class="size-5" />
					</button>
				{/if}
			</div>

			{#if many}
				<div class="flex justify-center gap-2 overflow-x-auto px-4 py-4">
					{#each images as image, position (image.url)}
						<button
							type="button"
							onclick={() => show(position)}
							aria-label="Фото {position + 1}"
							aria-current={position === index}
							class={cn(
								'aspect-3/4 w-12 shrink-0 cursor-pointer overflow-hidden rounded-lg transition-opacity',
								position === index
									? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
									: 'opacity-50 hover:opacity-100'
							)}
						>
							<img src={image.url} alt="" class="size-full object-cover" loading="lazy" />
						</button>
					{/each}
				</div>
			{/if}
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
