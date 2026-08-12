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
		/** Рожевий градієнт для промо, нейтральний — для іміджевих банерів. */
		tone: 'brand' | 'neutral';
	};

	let { banners, interval = 6000 }: { banners: Banner[]; interval?: number } = $props();

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
	class="relative overflow-hidden rounded-3xl"
	onmouseenter={() => (paused = true)}
	onmouseleave={() => (paused = false)}
	onfocusin={() => (paused = true)}
	onfocusout={() => (paused = false)}
	aria-roledescription="carousel"
	aria-label="Акції та новинки"
>
	{#each banners as banner, bannerIndex (banner.title)}
		<div
			class={cn(
				'transition-opacity duration-700 ease-out',
				bannerIndex === index ? 'opacity-100' : 'pointer-events-none absolute inset-0 opacity-0'
			)}
			aria-hidden={bannerIndex !== index}
		>
			<div
				class={cn(
					'grid items-center gap-8 px-8 py-14 md:grid-cols-2 md:px-14 md:py-20',
					banner.tone === 'brand' ? 'bg-brand-soft' : 'bg-muted'
				)}
			>
				<div class="space-y-5">
					<p class="text-xs tracking-[0.25em] text-muted-foreground uppercase">
						{banner.eyebrow}
					</p>
					<h2 class="font-heading text-3xl leading-tight text-balance md:text-5xl">
						{banner.title}
					</h2>
					<p class="max-w-sm text-pretty text-muted-foreground">{banner.text}</p>
					<Button href={banner.cta.href} size="lg">{banner.cta.label}</Button>
				</div>

				{#if banner.image}
					<div class="aspect-4/3 overflow-hidden rounded-2xl md:aspect-square">
						<img
							src={banner.image}
							alt=""
							class="size-full object-cover"
							loading={bannerIndex === 0 ? 'eager' : 'lazy'}
						/>
					</div>
				{/if}
			</div>
		</div>
	{/each}

	{#if banners.length > 1}
		<div class="absolute inset-x-0 bottom-5 flex items-center justify-center gap-3">
			<Button
				variant="ghost"
				size="icon"
				class="size-8 rounded-full"
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
						class={cn(
							'h-1.5 rounded-full transition-all duration-300',
							dotIndex === index
								? 'w-7 bg-foreground'
								: 'w-1.5 bg-foreground/25 hover:bg-foreground/40'
						)}
					></button>
				{/each}
			</div>

			<Button
				variant="ghost"
				size="icon"
				class="size-8 rounded-full"
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
