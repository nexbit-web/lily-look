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

	/**
	 * Банер займає ширину сторінки: 1120 px на десктопі, екран мінус поля —
	 * на планшеті (по 16 px) і на телефоні (по 8 px).
	 */
	const sizes =
		'(min-width: 1152px) 1120px, (min-width: 768px) calc(100vw - 32px), calc(100vw - 16px)';

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

	/**
	 * Автопрогортання веде сама смужка під банером: слайд перемикається, коли
	 * її анімація добігла кінця (`animationend`).
	 *
	 * Раніше були два незалежні годинники — CSS-смужка й `setTimeout`. Пауза
	 * під курсором заморожувала смужку й продовжувала її з того самого місця,
	 * а таймер скидала й починала заново. Навели мишу на 90 % — смужка
	 * добігала за пів секунди, а банер стояв ще повні 4.5 с: «смуга дійшла до
	 * кінця, а картинка не перемикається». Тепер годинник один, і пауза
	 * зупиняє обидва разом.
	 */
	function progressDone() {
		if (!paused) go(index + 1);
	}

	/**
	 * Страховка: якщо анімація так і не закінчилась (браузер вимкнув
	 * анімації, смужку не намалювало), банер усе одно не застрягне. Відлік
	 * довший за смужку, тож у нормальній роботі першою завжди встигає вона —
	 * навіть одразу після паузи, коли смужці лишається менше повного кола.
	 */
	const WATCHDOG = 1.5;
	$effect(() => {
		if (paused || banners.length < 2) return;
		const shown = index;
		const timer = setTimeout(() => go(shown + 1), interval * WATCHDOG);
		return () => clearTimeout(timer);
	});

	/**
	 * Пауза — лише від справжньої миші й від фокуса з клавіатури.
	 *
	 * Дотик теж шле `mouseenter`, але `mouseleave` — ні, а тап по стрілці
	 * лишає на ній фокус: на телефоні після першого ж дотику банер ставав
	 * на паузу, доки не тапнеш деінде. Фокус від тапу чи кліку браузер не
	 * вважає `:focus-visible` — за цим і відрізняємо клавіатуру.
	 */
	function pointerEnter(event: PointerEvent) {
		if (event.pointerType === 'mouse') paused = true;
	}
	function pointerLeave(event: PointerEvent) {
		if (event.pointerType === 'mouse') paused = false;
	}
	function focusIn(event: FocusEvent) {
		if (event.target instanceof HTMLElement && focusVisible(event.target)) paused = true;
	}
	function focusVisible(element: HTMLElement): boolean {
		try {
			return element.matches(':focus-visible');
		} catch {
			return true;
		}
	}

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
	onpointerenter={pointerEnter}
	onpointerleave={pointerLeave}
	onfocusin={focusIn}
	onfocusout={() => (paused = false)}
	ontouchstart={touchStart}
	ontouchend={touchEnd}
	aria-roledescription="carousel"
	aria-label="Акції та новинки"
>
	<!--
		Рамка. На десктопі — рівно пропорції банера (1916×821), кадр видно
		цілком. На телефоні — 359×166: невелика смуга на всю ширину, трохи
		вища за сам банер, тож кадр підлаштовується за висотою, а зайве
		(близько 7 % ширини) зрізається справа — `object-left` береже текст,
		який на всіх банерах зліва. Кути на телефоні менш заокруглені.
	-->
	<div
		class="relative aspect-[359/166] overflow-hidden rounded-xl bg-muted md:aspect-[1916/821] md:rounded-3xl"
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
									Кінець її анімації й перемикає слайд (див. progressDone).
									key на index перезапускає анімацію на кожному слайді.
								-->
								{#key index}
									<span
										class="block h-full origin-left bg-foreground/70"
										data-progress
										onanimationend={progressDone}
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
