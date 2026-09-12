<script lang="ts">
	import Lightbox from '$lib/components/product/lightbox.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { ProductImageView } from '$lib/types';
	import { cn } from '$lib/utils';
	import { untrack } from 'svelte';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ExpandIcon from '@lucide/svelte/icons/expand';

	let {
		images,
		name,
		/** Обраний колір: галерея показує кадри саме його. */
		color = null
	}: { images: ProductImageView[]; name: string; color?: string | null } = $props();

	/**
	 * Свайп по головному фото — щоб на телефоні не тягтись до мініатюр.
	 *
	 * Головне тут — не заважати прокрутці сторінки. Палець майже ніколи не
	 * йде рівно вниз, тож перші пікселі руху ми лише дивимось, куди він
	 * веде, і фото не чіпаємо. Щойно напрямок ясний — жест стає або
	 * гортанням (горизонтальний), або прокруткою (вертикальний), і
	 * перемкнутись на ходу вже не може.
	 */
	const DIRECTION_LOCK = 10;
	/** Протягнути треба або на п'яту частину кадру… */
	const SWIPE_RATIO = 0.2;
	const SWIPE_MIN = 40;
	/** …або коротко, але швидко — різкий рух теж означає «наступне фото». */
	const FLICK_MS = 250;
	const FLICK_DISTANCE = 18;
	/** На краю стрічки тягнути нікуди — рух в'язне, і це видно пальцем. */
	const EDGE_RESISTANCE = 0.3;

	let index = $state(0);
	let lightboxOpen = $state(false);

	/**
	 * Кадри обраного кольору плюс спільні (ті, у яких колір не вказаний, —
	 * крій, тканина зблизька).
	 *
	 * Якщо власних кадрів у кольору немає жодного, показуємо весь набір
	 * товару: це означає, що в CRM колір ще не розмітили, і краще дати
	 * покупцеві всі фото, ніж єдину тканину зблизька.
	 */
	const frames = $derived.by(() => {
		if (!color) return images;

		const own = images.filter((image) => image.color === color);
		if (own.length === 0) return images;

		return images.filter((image) => image.color === color || image.color === null);
	});

	const active = $derived(frames[index]);
	const many = $derived(frames.length > 1);

	// Новий колір — нова стрічка, отже показуємо її з першого кадру.
	// Порівняння зі збереженим значенням, а не ефект на кожен рендер:
	// інакше галерея смикалась би назад щоразу, коли щось перемалювалось.
	let lastColor = untrack(() => color);
	$effect(() => {
		if (color === lastColor) return;
		lastColor = color;
		index = 0;
	});

	/**
	 * Фото інших кольорів гріємо у фоні, коли браузер вільний: перемикання
	 * має показувати кадр одразу, а не після нового запиту. Беремо по
	 * одному кадру на колір — решта підвантажиться, коли колір оберуть,
	 * і перший екран через це не важчає.
	 */
	$effect(() => {
		// Кольорів у товару одиниці, тож пошук по масиву дешевший за Set —
		// і не тягне за собою реактивну обгортку зі svelte/reactivity.
		const warm: ProductImageView[] = [];
		for (const image of images) {
			if (!image.color || image.color === color) continue;
			if (warm.some((picked) => picked.color === image.color)) continue;
			warm.push(image);
		}
		if (warm.length === 0) return;

		let cancelled = false;
		const run = () => {
			if (cancelled) return;
			for (const image of warm) {
				const preload = new Image();
				// Низький пріоритет: прогрів не має відбирати канал у того фото,
				// яке покупець бачить просто зараз.
				preload.fetchPriority = 'low';
				preload.decoding = 'async';
				preload.src = image.url;
			}
		};

		const idle = 'requestIdleCallback' in window;
		const id = idle ? requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 1000);

		return () => {
			cancelled = true;
			if (idle) cancelIdleCallback(id as number);
			else clearTimeout(id);
		};
	});

	// Які фото вже завантажились: інакше при поверненні до фото
	// скелетон блимав би вдруге.
	const shown = $state<Record<string, boolean>>({});

	let track = $state<HTMLElement | null>(null);
	let dragX = $state(0);
	let dragging = $state(false);

	let startX = 0;
	let startY = 0;
	let startedAt = 0;
	let frameWidth = 0;
	/** Куди пішов жест: ще не ясно / гортаємо / це прокрутка сторінки. */
	let axis: 'unknown' | 'x' | 'y' = 'unknown';
	let activePointer: number | null = null;
	let moved = false;

	// Фото з кешу встигають завантажитись до гідратації — onload уже не буде.
	// Перечитуємо і після зміни кольору: там кадри вже прогріті.
	$effect(() => {
		void frames;
		if (!track) return;
		for (const image of track.querySelectorAll('img')) {
			if (image.complete) shown[image.src] = true;
		}
	});

	function go(delta: number) {
		if (!many) return;
		index = (index + delta + frames.length) % frames.length;
	}

	function pointerdown(event: PointerEvent) {
		if (!many || event.button !== 0) return;

		// Захоплення вказівника ще не ставимо: поки напрямок невідомий,
		// жест може виявитись прокруткою — і забирати його в браузера не можна.
		activePointer = event.pointerId;
		axis = 'unknown';
		moved = false;
		startX = event.clientX;
		startY = event.clientY;
		startedAt = event.timeStamp;
		frameWidth = (event.currentTarget as HTMLElement).offsetWidth;
	}

	function pointermove(event: PointerEvent) {
		if (activePointer !== event.pointerId) return;

		const dx = event.clientX - startX;
		const dy = event.clientY - startY;

		if (axis === 'unknown') {
			if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;

			if (Math.abs(dy) >= Math.abs(dx)) {
				// Людина гортає сторінку — відпускаємо жест зовсім.
				axis = 'y';
				activePointer = null;
				return;
			}

			axis = 'x';
			dragging = true;
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}

		moved = true;
		dragX = resist(dx);
	}

	/** За краєм стрічки кадру немає, тож рух туди віддаємо не повністю. */
	function resist(dx: number): number {
		const atStart = index === 0 && dx > 0;
		const atEnd = index === frames.length - 1 && dx < 0;
		return atStart || atEnd ? dx * EDGE_RESISTANCE : dx;
	}

	function pointerup(event: PointerEvent) {
		if (activePointer !== event.pointerId || axis !== 'x') {
			cancelDrag();
			return;
		}

		const distance = Math.abs(dragX);
		const enough = distance > Math.max(SWIPE_MIN, frameWidth * SWIPE_RATIO);
		const flick = event.timeStamp - startedAt < FLICK_MS && distance > FLICK_DISTANCE;

		if (enough || flick) go(dragX < 0 ? 1 : -1);
		cancelDrag();
	}

	/**
	 * Кінець жесту за будь-якої причини. `dragX` обнуляємо завжди: якщо
	 * браузер забрав жест собі під прокрутку, зсув фото так і лишився б
	 * висіти — саме через це фото «трохи зʼїжджало» при скролі.
	 */
	function cancelDrag() {
		activePointer = null;
		axis = 'unknown';
		dragging = false;
		dragX = 0;
	}
</script>

<div class="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
	{#if many}
		<div
			class="no-scrollbar flex shrink-0 gap-2 overflow-x-auto max-sm:px-4 sm:flex-col sm:overflow-visible"
		>
			{#each frames as image, position (image.url)}
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
				!dragging && 'transition-transform duration-300 ease-out motion-reduce:transition-none'
			)}
			style="transform: translate3d(calc({-index * 100}% + {dragX}px), 0, 0)"
		>
			{#each frames as image (image.url)}
				<img
					src={image.url}
					alt={image.alt || name}
					draggable="false"
					loading={image.url === frames[0]?.url ? 'eager' : 'lazy'}
					fetchpriority={image.url === frames[0]?.url ? 'high' : undefined}
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
			onpointercancel={cancelDrag}
			onlostpointercapture={cancelDrag}
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
				{index + 1} / {frames.length}
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

<Lightbox images={frames} {name} bind:open={lightboxOpen} bind:index />
