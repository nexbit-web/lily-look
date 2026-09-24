<script lang="ts" module>
	/**
	 * Банер — готова картинка з текстом усередині (`static/banners`).
	 *
	 * Поверх неї нічого не пишемо: текст і композицію вже зробив
	 * дизайнер, а другий шар тексту зверху тільки б їх перекрив.
	 */
	export type Banner = {
		/** Шлях без ширини й розширення: `/banners/autumn-collection`. */
		image: string;
		/** Те, що написано на картинці, — для скрінрідера й пошуковика. */
		alt: string;
		/** Куди веде клік по банеру. `null` — банер лише повідомляє. */
		href: string | null;
	};

	/**
	 * Ширини, у яких лежить кожен банер: `<image>-960.avif` і так далі.
	 * 960 бере телефон, 1280 — телефон із щільним екраном і планшет, 1916 —
	 * оригінал для десктопа.
	 */
	const WIDTHS = [960, 1280, 1916];

	/**
	 * Запасний кадр у WebP — для браузерів без AVIF (iPhone на iOS 15 і
	 * старіших). Без нього там на місці банера була б порожнеча.
	 */
	const FALLBACK_WIDTH = 1280;

	/** Пропорції всіх банерів — під них зроблена рамка, щоб кадр не обрізався. */
	const BANNER_RATIO = '1916 / 821';
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let { banners, interval = 4500 }: { banners: Banner[]; interval?: number } = $props();

	let index = $state(0);
	let paused = $state(false);

	const current = $derived(banners[index]);

	/** Банер займає ширину сторінки: 1120 px на десктопі, екран мінус поля на телефоні. */
	const sizes = '(min-width: 1152px) 1120px, calc(100vw - 32px)';

	const srcset = (image: string) =>
		WIDTHS.map((width) => `${image}-${width}.avif ${width}w`).join(', ');

	/**
	 * Поки перший банер не приїхав, на його місці пульсує заглушка: екран не
	 * порожній, а рамка вже потрібної висоти — нічого не підстрибне.
	 */
	let ready = $state(false);

	/**
	 * Сусідні слайди лежать у тому ж кадрі, тільки прозорі, — для браузера
	 * вони «на екрані», тож `loading=lazy` їх не стримує, і вони тягнуть
	 * канал у першого фото. А перше фото — найбільший елемент сторінки, по
	 * ньому Google і міряє швидкість. Тому решту вмикаємо після нього.
	 */
	let awake = $state(false);

	/**
	 * Фото з кеша встигає завантажитись ще до гідратації, і `onload` по
	 * ньому вже не спрацює — заглушка висіла б над готовим кадром. Такий
	 * випадок ловимо одразу при появі елемента.
	 */
	function whenShown(node: HTMLImageElement) {
		if (node.complete) ready = true;
	}

	$effect(() => {
		if (ready) {
			awake = true;
			return;
		}
		// Перше фото не приїхало (мережа лягла) — сусіди все одно мають
		// з'явитись, інакше гортати буде нічого.
		const timer = setTimeout(() => (awake = true), 3000);
		return () => clearTimeout(timer);
	});

	function go(next: number) {
		index = (next + banners.length) % banners.length;
	}

	// Відлік іде заново з кожним слайдом, хоч би хто його перемкнув: після
	// свайпу чи кліку по смужці покупець дивиться банер повний час, а не
	// залишок чужого відліку. Під курсором і у фокусі прогортання стоїть —
	// інакше банер перемкнувся б саме тоді, коли по ньому цілять клікнути.
	$effect(() => {
		if (paused || banners.length < 2) return;
		const shown = index;
		const timer = setTimeout(() => go(shown + 1), interval);
		return () => clearTimeout(timer);
	});

	/**
	 * Свайп на телефоні. Поріг відсікає тремтіння пальця під час звичайного
	 * тапу по банеру, а рух більше вертикальний, ніж горизонтальний, — це
	 * прокрутка сторінки, його не чіпаємо.
	 */
	const SWIPE_PX = 40;
	let touch: { x: number; y: number } | null = null;

	function touchStart(event: TouchEvent) {
		const point = event.touches[0];
		touch = point ? { x: point.clientX, y: point.clientY } : null;
	}

	function touchEnd(event: TouchEvent) {
		const point = event.changedTouches[0];
		if (!touch || !point) return;
		const dx = point.clientX - touch.x;
		const dy = point.clientY - touch.y;
		touch = null;
		if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
		go(dx < 0 ? index + 1 : index - 1);
	}
</script>

{#snippet picture(banner: Banner, first: boolean)}
	<picture>
		<source type="image/avif" srcset={srcset(banner.image)} {sizes} />
		<img
			{@attach whenShown}
			src="{banner.image}-{FALLBACK_WIDTH}.webp"
			alt={banner.alt}
			width="1916"
			height="821"
			fetchpriority={first ? 'high' : 'low'}
			loading={first ? 'eager' : 'lazy'}
			decoding={first ? 'sync' : 'async'}
			onload={() => (ready = true)}
			class="size-full object-cover object-left"
		/>
	</picture>
{/snippet}

<section
	onmouseenter={() => (paused = true)}
	onmouseleave={() => (paused = false)}
	onfocusin={() => (paused = true)}
	onfocusout={() => (paused = false)}
	ontouchstart={touchStart}
	ontouchend={touchEnd}
	aria-roledescription="carousel"
	aria-label="Акції та новинки"
>
	<!--
		Рамка тих самих пропорцій, що й банер: на будь-якому екрані він
		видний цілком, без обрізаних країв. На телефоні це невелика смуга
		на всю ширину, а не картинка на пів екрана, з якої видно шматок.
		`object-left` — запас на майбутнє: якщо новий банер вийде трохи
		інших пропорцій, обріжеться права частина, а не текст зліва.
	-->
	<div
		class="relative overflow-hidden rounded-2xl bg-muted md:rounded-3xl"
		style:aspect-ratio={BANNER_RATIO}
	>
		{#if !ready}
			<div class="absolute inset-0 animate-pulse bg-muted" aria-hidden="true"></div>
		{/if}

		{#each banners as banner, bannerIndex (banner.image)}
			{@const active = bannerIndex === index}
			<div
				class={cn(
					'absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none',
					active ? 'opacity-100' : 'pointer-events-none opacity-0'
				)}
				aria-hidden={!active}
			>
				{#if active || awake}
					{#if banner.href}
						<a
							href={banner.href}
							tabindex={active ? 0 : -1}
							class="block size-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
						>
							{@render picture(banner, bannerIndex === 0)}
						</a>
					{:else}
						{@render picture(banner, bannerIndex === 0)}
					{/if}
				{/if}
			</div>
		{/each}
	</div>

	{#if banners.length > 1}
		<!-- Керування під банером, а не на ньому: там текст і сама річ. -->
		<div class="mt-2 flex items-center justify-center gap-2 md:mt-3 md:gap-4">
			<Button
				variant="ghost"
				size="icon"
				class="size-8 rounded-full text-muted-foreground"
				aria-label="Попередній банер"
				onclick={() => go(index - 1)}
			>
				<ChevronLeftIcon class="size-4" />
			</Button>

			<div class="flex items-center">
				{#each banners as banner, dotIndex (banner.image)}
					<!-- Смужка тонка, а кнопка навколо неї — під палець. -->
					<button
						type="button"
						onclick={() => (index = dotIndex)}
						aria-label="Банер {dotIndex + 1}"
						aria-current={dotIndex === index}
						class="group px-1 py-3"
					>
						<span
							class="block h-1 w-8 overflow-hidden rounded-full bg-foreground/15 transition-colors group-hover:bg-foreground/25 md:w-10"
						>
							{#if dotIndex === index}
								<!--
									Смужка заповнюється рівно за час показу слайда — видно,
									що зараз щось перемкнеться, і скільки лишилось чекати.
									key на index перезапускає анімацію на кожному слайді.
								-->
								{#key index}
									<span
										class="block h-full origin-left bg-foreground/70"
										style="animation: hero-progress {interval}ms linear forwards; animation-play-state: {paused
											? 'paused'
											: 'running'}"
									></span>
								{/key}
							{/if}
						</span>
					</button>
				{/each}
			</div>

			<Button
				variant="ghost"
				size="icon"
				class="size-8 rounded-full text-muted-foreground"
				aria-label="Наступний банер"
				onclick={() => go(index + 1)}
			>
				<ChevronRightIcon class="size-4" />
			</Button>
		</div>
	{/if}

	<!-- Для скрінрідерів: озвучуємо зміну слайда -->
	<p class="sr-only" aria-live="polite">
		Банер {index + 1} з {banners.length}: {current?.alt}
	</p>
</section>
