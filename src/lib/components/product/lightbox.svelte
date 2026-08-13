<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner';
	import { cn } from '$lib/utils';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import XIcon from '@lucide/svelte/icons/x';
	import ZoomInIcon from '@lucide/svelte/icons/zoom-in';
	import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
	import { Dialog as DialogPrimitive } from 'bits-ui';

	/**
	 * Перегляд фото на весь екран.
	 *
	 * Свій, замість зовнішньої бібліотеки: потрібні рівно чотири речі —
	 * гортання, зум по кліку, перетягування збільшеного фото і закриття.
	 * Усе інше (портал, пастка фокуса, блокування скролу, Esc) уже вміє
	 * Dialog з bits-ui, на якому побудовані й компоненти shadcn.
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

	let areaEl = $state<HTMLElement | null>(null);
	let imageEl = $state<HTMLImageElement | null>(null);

	let loading = $state(true);
	let zoomed = $state(false);

	// Зсув фото: у зумі це панорамування, без зуму — свайп між кадрами.
	let panX = $state(0);
	let panY = $state(0);
	let swipeX = $state(0);

	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let fromX = 0;
	let fromY = 0;
	let moved = false;

	function go(delta: number) {
		if (!many) return;
		index = (index + delta + images.length) % images.length;
	}

	function resetZoom() {
		zoomed = false;
		panX = 0;
		panY = 0;
	}

	// Нове фото — знову без зуму й з «завантажується».
	$effect(() => {
		void index;
		resetZoom();
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

	const clamp = (value: number, max: number) => Math.min(max, Math.max(-max, value));

	/** За скільки пікселів фото виходить за екран — далі тягнути нікуди. */
	function limits() {
		if (!areaEl || !imageEl) return { x: 0, y: 0 };
		return {
			x: Math.max(0, (imageEl.offsetWidth * ZOOM_SCALE - areaEl.clientWidth) / 2),
			y: Math.max(0, (imageEl.offsetHeight * ZOOM_SCALE - areaEl.clientHeight) / 2)
		};
	}

	/** Зум із наведенням: точка, по якій клікнули, їде в центр екрана. */
	function zoomTo(clientX?: number, clientY?: number) {
		if (!imageEl) return;

		const box = imageEl.getBoundingClientRect();
		const dx = clientX === undefined ? 0 : clientX - (box.left + box.width / 2);
		const dy = clientY === undefined ? 0 : clientY - (box.top + box.height / 2);

		zoomed = true;
		const max = limits();
		panX = clamp(-dx * ZOOM_SCALE, max.x);
		panY = clamp(-dy * ZOOM_SCALE, max.y);
	}

	function pointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		if (!zoomed && !many) return;

		dragging = true;
		moved = false;
		startX = event.clientX;
		startY = event.clientY;
		fromX = panX;
		fromY = panY;
		imageEl?.setPointerCapture(event.pointerId);
	}

	function pointermove(event: PointerEvent) {
		if (!dragging) return;

		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;

		if (zoomed) {
			const max = limits();
			panX = clamp(fromX + dx, max.x);
			panY = clamp(fromY + dy, max.y);
		} else {
			swipeX = dx;
		}
	}

	function pointerup() {
		if (!dragging) return;
		dragging = false;

		if (zoomed) return;
		if (Math.abs(swipeX) > SWIPE_THRESHOLD) go(swipeX < 0 ? 1 : -1);
		swipeX = 0;
	}

	function onphotoclick(event: MouseEvent) {
		// Клік після протягування — це кінець жесту, а не намір зумити.
		if (moved) return;
		if (zoomed) resetZoom();
		else zoomTo(event.clientX, event.clientY);
	}
</script>

<svelte:window {onkeydown} />

<DialogPrimitive.Root bind:open>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-background/90 backdrop-blur-xl data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
		/>

		<DialogPrimitive.Content
			class="fixed inset-0 z-50 flex flex-col outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
		>
			<DialogPrimitive.Title class="sr-only">{name} — фото на весь екран</DialogPrimitive.Title>
			<DialogPrimitive.Description class="sr-only">
				Гортайте стрілками або свайпом. Клік по фото збільшує його, збільшене можна тягнути.
			</DialogPrimitive.Description>

			<header class="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
				<span class="text-xs tracking-[0.2em] text-muted-foreground uppercase tabular-nums">
					{#if many}{index + 1} / {images.length}{:else}{name}{/if}
				</span>

				<div class="flex items-center gap-1">
					<button
						type="button"
						onclick={() => (zoomed ? resetZoom() : zoomTo())}
						aria-label={zoomed ? 'Зменшити' : 'Збільшити'}
						class="flex size-10 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						{#if zoomed}
							<ZoomOutIcon class="size-5" />
						{:else}
							<ZoomInIcon class="size-5" />
						{/if}
					</button>

					<DialogPrimitive.Close
						class="flex size-10 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Закрити"
					>
						<XIcon class="size-5" />
					</DialogPrimitive.Close>
				</div>
			</header>

			<div
				bind:this={areaEl}
				class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-2 sm:px-16"
			>
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
					<!-- Фото — прямий нащадок flex-контейнера: тільки так max-h-full
					     тримає його в межах екрана, не розтягуючи. Жести миші й пальця
					     живуть тут, а з клавіатури зум доступний кнопкою в шапці. -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<img
						bind:this={imageEl}
						src={current.url}
						alt={current.alt || name}
						draggable="false"
						onload={() => (loading = false)}
						onclick={onphotoclick}
						onpointerdown={pointerdown}
						onpointermove={pointermove}
						onpointerup={pointerup}
						onpointercancel={pointerup}
						style="transform: translate3d({zoomed ? panX : swipeX}px, {zoomed
							? panY
							: 0}px, 0) scale({zoomed ? ZOOM_SCALE : 1});"
						class={cn(
							'relative max-h-full max-w-full rounded-xl object-contain select-none',
							zoomed ? 'touch-none' : 'touch-pan-y',
							zoomed ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
							loading && 'opacity-0',
							!dragging &&
								'transition-transform duration-300 ease-out motion-reduce:transition-none'
						)}
					/>
				{/if}

				{#if many && !zoomed}
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
							onclick={() => (index = position)}
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
