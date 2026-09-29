<script lang="ts">
	import { CARD_BUY, CARD_VIEW } from '$lib/components/product/buy-button';
	import { IMAGE_CARD, fallbackToOriginal, imageSrc } from '$lib/image';
	import { discountPercent, formatPercent, formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { ProductCard } from '$lib/types';
	import { cn } from '$lib/utils';
	import ShoppingBagIcon from '@lucide/svelte/icons/shopping-bag';
	import TagIcon from '@lucide/svelte/icons/tag';

	let {
		product,
		priority = false,
		lead = false
	}: {
		product: ProductCard;
		priority?: boolean;
		/**
		 * Перша картка сітки на першому екрані. Її фото — найбільший елемент сторінки
		 * каталогу, і саме по ньому Google міряє швидкість (LCP). `eager` лише не
		 * відкладає запит, а `fetchpriority` ставить його попереду скриптів і сусідніх
		 * фото. Тільки одній картці: коли «важливі» всі, важливої немає.
		 */
		lead?: boolean;
	} = $props();

	const discount = $derived(discountPercent(product.price, product.compareAt));
	/** Скільки покупець заощаджує саме зараз — гривнями, а не відсотками. */
	const saving = $derived(
		product.compareAt && product.compareAt > product.price ? product.compareAt - product.price : 0
	);

	/** Бігучий рядок знижки по низу фото. */
	const strip = $derived(
		discount
			? `Знижка −${formatPercent(discount)}% · Економія ${formatPrice(saving)} · Встигніть купити`
			: null
	);

	/**
	 * Поки фото не завантажилось, під ним пульсує заглушка. Картки нижче
	 * екрана тягнуть фото ліниво, і без заглушки там зяяла б сіра пляма —
	 * незрозуміло, чи то вантажиться, чи то зламалось.
	 *
	 * Заглушка лежить окремим шаром ПІД фото, а саме фото ніколи не
	 * ховається. Колись було навпаки: кадр стояв прозорим, доки скрипт не
	 * скаже «завантажилось». Щойно цей сигнал запізнювався (повільний
	 * телефон, довга гідратація, пропущена подія), картка лишалась сірою
	 * з уже готовим фото — і проявлялась лише від наведення курсора. Тепер
	 * браузер малює кадр, щойно його отримав, а `loaded` тільки прибирає
	 * заглушку, якої під фото й так не видно.
	 */
	let loaded = $state(false);
	let cover = $state<HTMLImageElement>();

	/**
	 * Друге фото має сенс лише там, де є курсор.
	 *
	 * На телефоні навести нічим, а кадр усе одно завантажувався — це вдвічі
	 * більше фото на сітку задарма. CSS тут не допоможе: браузер тягне
	 * `<img>` незалежно від того, чи його видно. Тому на дотикових екранах
	 * його просто немає в розмітці — і на сервері теж, бо там про пристрій
	 * нічого не відомо, а зайве фото дорожче за зайвий кадр після гідратації.
	 */
	// Свідомо `$state` з `$effect`, а не `$derived`: похідне значення
	// порахувалось би вже під час першого малювання на клієнті, розійшлося б
	// із HTML від сервера (де про `window` нічого не відомо) — і гідратація
	// почалася б із розбіжності. Так значення просто змінюється після неї.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let canHover = $state(false);
	$effect(() => {
		canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	});

	// Фото з кеша встигає завантажитись до гідратації, і `onload` по ньому
	// вже не спрацює — такий кадр упізнаємо по `complete`.
	$effect(() => {
		if (cover?.complete) loaded = true;
	});
</script>

<!-- Картка тягнеться на всю висоту рядка сітки, а «Купити» стоїть внизу:
     у сусідніх карток кнопки в одну лінію, хоч назви й різної довжини.
     Ледь помітна рамка тримає фото, назву й кнопку разом як одну річ;
     під курсором вона трохи темнішає. -->
<a
	href="/product/{product.slug}"
	class="group flex h-full w-full flex-col rounded-lg border border-foreground/[0.07] p-1.5 transition-colors duration-300 hover:border-foreground/20 sm:p-2"
>
	<!-- На телефоні кадр вищий: у дві колонки річ видно дрібно, і зайва
	     висота працює краще за зайві піксели ширини. -->
	<div class="relative aspect-3/4 overflow-hidden rounded-sm bg-muted sm:aspect-4/5">
		{#if product.image && !loaded}
			<div class="absolute inset-0 animate-pulse bg-muted" aria-hidden="true"></div>
		{/if}

		{#if product.image}
			<img
				bind:this={cover}
				src={imageSrc(product.image.url, IMAGE_CARD)}
				alt={product.image.alt}
				loading={priority ? 'eager' : 'lazy'}
				fetchpriority={lead ? 'high' : undefined}
				decoding="async"
				onload={() => (loaded = true)}
				onerror={(event) => product.image && fallbackToOriginal(event, product.image.url)}
				class={cn(
					// `relative` — щоб фото лягло поверх заглушки: абсолютний шар
					// інакше малювався б над звичайним елементом.
					'relative size-full object-cover transition-transform duration-500 ease-out motion-reduce:transition-none',
					// Без другого фото картка не має чим відповісти на наведення —
					// тоді лишаємо легкий зум.
					!(product.hoverImage && canHover) && 'group-hover:scale-105'
				)}
			/>
		{/if}

		{#if product.hoverImage && canHover}
			<!-- Друге фото лежить зверху й проявляється. Перше не гасимо: інакше
			     на середині переходу прозирав би фон картки. -->
			<img
				src={imageSrc(product.hoverImage.url, IMAGE_CARD)}
				alt=""
				aria-hidden="true"
				loading="lazy"
				class="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 motion-reduce:transition-none"
			/>
		{/if}

		{#if strip}
			<!--
				Червона смужка по низу фото з бігучим рядком: рух ловить око в
				сітці, де все інше стоїть. Скрінрідер читає текст один раз (sr-only), а не
				бігучий повтор. Хто вимкнув анімацію в системі, бачить рядок
				нерухомим.
			-->
			<div
				data-slot="sale-strip"
				class="absolute inset-x-0 bottom-0 h-6 overflow-hidden bg-sale text-white"
			>
				<span class="sr-only">{strip}</span>
				<!-- Маска — на тексті, а не на смужці: червоне тягнеться на всю
				     ширину, а тане на краях лише рядок. -->
				<div class="marquee h-full" aria-hidden="true">
					<div class="marquee-track flex w-max">
						{#each [0, 1] as half (half)}
							<div class="flex shrink-0">
								{#each [0, 1, 2] as repeat (repeat)}
									<span
										class="flex items-center gap-1.5 px-4 text-[0.7rem] leading-6 font-semibold tracking-wide whitespace-nowrap uppercase"
									>
										<TagIcon class="size-3" strokeWidth={2.25} />
										{strip}
									</span>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		{#if !product.inStock}
			<div
				class="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
			>
				<span class="text-xs tracking-[0.15em] uppercase">Немає в наявності</span>
			</div>
		{/if}
	</div>

	<div class="mt-3 flex-1 space-y-1">
		<h3 class="text-sm transition-colors group-hover:text-muted-foreground">{product.name}</h3>
		<p class="flex items-baseline gap-2">
			<span class="text-sm font-medium">{formatPrice(product.price)}</span>
			{#if product.compareAt && product.compareAt > product.price}
				<span class="text-xs text-muted-foreground line-through">
					{formatPrice(product.compareAt)}
				</span>
			{/if}
		</p>
		{#if product.colors.length > 1}
			<p class="text-xs text-muted-foreground">
				{product.colors.length}
				{plural(product.colors.length, 'колір', 'кольори', 'кольорів')}
			</p>
		{/if}
	</div>

	<!--
		Заклик до дії. Уся картка й так веде на товар, але без кнопки частина
		покупців не здогадується, куди натиснути, — особливо з телефона після
		реклами. Прихована від скрінрідера: для нього посилання вже назване
		назвою товару, а «Купити» в кожній картці тільки додавало б шуму.
	-->
	<span
		aria-hidden="true"
		data-slot="card-cta"
		class={cn(
			'mt-3 inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-medium',
			product.inStock ? CARD_BUY : CARD_VIEW
		)}
	>
		{#if product.inStock}
			<ShoppingBagIcon class="size-4" aria-hidden="true" />
			Купити
		{:else}
			Переглянути
		{/if}
	</span>
</a>
