<script lang="ts">
	import { IMAGE_WIDTHS, fallbackToOriginal, imageSrcSet } from '$lib/image';
	import { discountPercent, formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { ProductCard } from '$lib/types';
	import { cn } from '$lib/utils';
	import TagIcon from '@lucide/svelte/icons/tag';

	let { product, priority = false }: { product: ProductCard; priority?: boolean } = $props();

	const discount = $derived(discountPercent(product.price, product.compareAt));

	/**
	 * Картка ніколи не ширша за половину телефона або чверть контейнера,
	 * тож просити в CDN оригінал немає сенсу — браузер обере з `srcset`
	 * найменший кадр, який не буде видно як мило.
	 */
	const SIZES = '(min-width: 1024px) 280px, 50vw';

	/**
	 * Поки фото не завантажилось, на його місці пульсує заглушка. Картки
	 * нижче екрана тягнуть фото ліниво, і без заглушки там зяяла б сіра
	 * пляма — незрозуміло, чи то вантажиться, чи то зламалось.
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

<a href="/product/{product.slug}" class="group block">
	<!-- На телефоні кадр вищий: у дві колонки річ видно дрібно, і зайва
	     висота працює краще за зайві піксели ширини. -->
	<div
		class={cn(
			'relative aspect-3/4 overflow-hidden rounded-sm bg-muted sm:aspect-4/5',
			product.image && !loaded && 'animate-pulse'
		)}
	>
		{#if product.image}
			<img
				bind:this={cover}
				src={product.image.url}
				srcset={imageSrcSet(product.image.url, IMAGE_WIDTHS.card)}
				sizes={SIZES}
				alt={product.image.alt}
				loading={priority ? 'eager' : 'lazy'}
				decoding="async"
				onload={() => (loaded = true)}
				onerror={(event) => product.image && fallbackToOriginal(event, product.image.url)}
				class={cn(
					// Прозорість і масштаб в одному переході: два окремих класи
					// `transition-*` злилися б в один, і проявлення зникло б.
					'size-full object-cover transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none',
					// Кадр проявляється, а не стає ривком поверх заглушки. Фото
					// першого екрана не гасимо: зайва анімація там лише
					// відкладала б найбільший елемент сторінки.
					!priority && !loaded && 'opacity-0',
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
				src={product.hoverImage.url}
				srcset={imageSrcSet(product.hoverImage.url, IMAGE_WIDTHS.card)}
				sizes={SIZES}
				alt=""
				aria-hidden="true"
				loading="lazy"
				class="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 motion-reduce:transition-none"
			/>
		{/if}

		{#if discount}
			<span
				class="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-sale px-2 py-1 text-xs font-semibold text-white shadow-sm"
			>
				<TagIcon class="size-3.5" strokeWidth={2.25} aria-hidden="true" />
				−{discount}%
			</span>
		{/if}

		{#if !product.inStock}
			<div
				class="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
			>
				<span class="text-xs tracking-[0.15em] uppercase">Немає в наявності</span>
			</div>
		{/if}
	</div>

	<div class="mt-3 space-y-1">
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
</a>
