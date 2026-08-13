<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import HeroSlider from '$lib/components/home/hero-slider.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { Button } from '$lib/components/ui/button';
	import { SITE } from '$lib/config';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{SITE.name} — {SITE.tagline}</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 pt-2">
	<HeroSlider banners={data.banners} />
</div>

{#if data.featured.length}
	<!-- Поява навішана на заголовок, а не на секцію: картки сітки
	     проявляються самі, і подвійна анімація тільки заважала б. -->
	<section class="mx-auto max-w-6xl px-4 py-20">
		<div class="mb-8 flex items-end justify-between gap-4" use:reveal>
			<div>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">Обране</p>
				<h2 class="mt-1 font-heading text-3xl">Бестселери сезону</h2>
			</div>
			<Button href="/catalog" variant="ghost" class="hidden sm:inline-flex">
				До каталогу
				<ArrowRightIcon />
			</Button>
		</div>

		<ProductGrid products={data.featured} />
	</section>
{/if}

{#if data.newArrivals.length}
	<section class="mx-auto max-w-6xl px-4 pb-8">
		<div class="mb-8" use:reveal>
			<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">Щойно завезли</p>
			<h2 class="mt-1 font-heading text-3xl">Новинки</h2>
		</div>

		<ProductGrid products={data.newArrivals} />
	</section>
{/if}
