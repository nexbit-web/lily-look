<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	export type Banner = {
		eyebrow: string;
		title: string;
		text: string;
		cta: { label: string; href: string };
		image: string | null;
		/** Рожевий акцент для промо, нейтральний — для іміджевих банерів. */
		tone: 'brand' | 'neutral';
	};

	let { banners, interval = 4500 }: { banners: Banner[]; interval?: number } = $props();

	let index = $state(0);
	let paused = $state(false);

	const current = $derived(banners[index]);

	function go(next: number) {
		index = (next + banners.length) % banners.length;
	}

	// Автопрогортання зупиняється під курсором і коли вкладка неактивна —
	// інакше користувач повертається на випадковий слайд.
	$effect(() => {
		if (paused || banners.length < 2) return;
		const timer = setInterval(() => go(index + 1), interval);
		return () => clearInterval(timer);
	});
</script>

<section
	class="relative h-[80svh] max-h-[860px] min-h-[480px] overflow-hidden rounded-3xl bg-muted"
	onmouseenter={() => (paused = true)}
	onmouseleave={() => (paused = false)}
	onfocusin={() => (paused = true)}
	onfocusout={() => (paused = false)}
	aria-roledescription="carousel"
	aria-label="Акції та новинки"
>
	{#each banners as banner, bannerIndex (banner.title)}
		{@const active = bannerIndex === index}
		<div
			class={cn(
				'absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none',
				active ? 'opacity-100' : 'pointer-events-none opacity-0'
			)}
			aria-hidden={!active}
		>
			{#if banner.image}
				<img
					src={banner.image}
					alt=""
					loading={bannerIndex === 0 ? 'eager' : 'lazy'}
					fetchpriority={bannerIndex === 0 ? 'high' : 'auto'}
					class="size-full object-cover object-top"
				/>
			{/if}

			<!--
				Дві заслінки замість однієї: знизу — під текстовий блок, зліва —
				під колонку з заголовком. Світле фото (біле полотно, пісок, льон)
				інакше з'їдає білі літери, і банер читається як зіпсований.
				Верх кадру лишається чистим — там сама річ.
			-->
			<div
				class="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 via-55% to-transparent"
			></div>
			<div
				class="absolute inset-0 hidden bg-linear-to-r from-black/60 via-black/10 to-transparent md:block"
			></div>

			<div class="absolute inset-x-0 bottom-0 p-8 pb-24 md:p-14 md:pb-28">
				<div class="max-w-xl space-y-4 text-white">
					<p
						class={cn(
							'text-xs tracking-[0.25em] uppercase',
							banner.tone === 'brand' ? 'text-brand' : 'text-white/75'
						)}
					>
						{banner.eyebrow}
					</p>
					<h2 class="font-heading text-4xl leading-[1.1] text-balance md:text-6xl">
						{banner.title}
					</h2>
					<p class="max-w-md text-pretty text-white/80">{banner.text}</p>
					<Button
						href={banner.cta.href}
						size="lg"
						class="mt-2 bg-white text-black hover:bg-white/90"
						tabindex={active ? 0 : -1}
					>
						{banner.cta.label}
					</Button>
				</div>
			</div>
		</div>
	{/each}

	{#if banners.length > 1}
		<div class="absolute inset-x-0 bottom-6 flex items-center justify-center gap-4 md:bottom-8">
			<Button
				variant="ghost"
				size="icon"
				class="size-8 rounded-full text-white hover:bg-white/15 hover:text-white"
				aria-label="Попередній банер"
				onclick={() => go(index - 1)}
			>
				<ChevronLeftIcon class="size-4" />
			</Button>

			<div class="flex items-center gap-2">
				{#each banners as banner, dotIndex (banner.title)}
					<button
						type="button"
						onclick={() => (index = dotIndex)}
						aria-label="Банер {dotIndex + 1}"
						aria-current={dotIndex === index}
						class="h-1 w-10 overflow-hidden rounded-full bg-white/30 transition-colors hover:bg-white/50"
					>
						{#if dotIndex === index}
							<!--
								Смужка заповнюється рівно за час показу слайда — видно,
								що зараз щось перемкнеться, і скільки лишилось чекати.
								key на index перезапускає анімацію на кожному слайді.
							-->
							{#key index}
								<span
									class="block h-full origin-left bg-white"
									style="animation: hero-progress {interval}ms linear forwards; animation-play-state: {paused
										? 'paused'
										: 'running'}"
								></span>
							{/key}
						{/if}
					</button>
				{/each}
			</div>

			<Button
				variant="ghost"
				size="icon"
				class="size-8 rounded-full text-white hover:bg-white/15 hover:text-white"
				aria-label="Наступний банер"
				onclick={() => go(index + 1)}
			>
				<ChevronRightIcon class="size-4" />
			</Button>
		</div>
	{/if}

	<!-- Для скрінрідерів: озвучуємо зміну слайда -->
	<p class="sr-only" aria-live="polite">
		Банер {index + 1} з {banners.length}: {current?.title}
	</p>
</section>
