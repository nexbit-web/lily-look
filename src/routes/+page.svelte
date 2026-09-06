<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import CategoryStrip from '$lib/components/home/category-strip.svelte';
	import HeroSlider from '$lib/components/home/hero-slider.svelte';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import SectionHeading from '$lib/components/home/section-heading.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { Button } from '$lib/components/ui/button';
	import { FREE_DELIVERY_FROM, SITE } from '$lib/config';
	import { formatPrice } from '$lib/money';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Аргументи проти вагання — рівно ті, через які кидають кошик. */
	const assurances = [
		{
			title: `Безкоштовна доставка від ${formatPrice(FREE_DELIVERY_FROM)}`,
			text: 'Нова Пошта по всій Україні, відправка того ж дня до 15:00.'
		},
		{
			title: 'Обмін і повернення 14 днів',
			text: 'Не підійшов розмір — міняємо без пояснень і зайвих питань.'
		},
		{
			title: 'Оплата при отриманні',
			text: 'Спершу приміряєте на пошті, потім платите.'
		}
	];
</script>

<PageMeta
	title="{SITE.name} — жіночий одяг з доставкою по Україні"
	description="Сукні, костюми, верхній одяг і трикотаж від {SITE.name}. Доставка Новою Поштою по всій Україні, оплата при отриманні, обмін і повернення 14 днів."
	canonical="/"
	image={data.banners[0]?.image ?? null}
/>

<div class="mx-auto max-w-6xl px-4 pt-2">
	<!--
		Заголовок сторінки потрібен і пошуковику, і скрінрідеру, але візуально
		його роль виконує банер: писати те саме двічі — псувати композицію.
		Тому h1 лишається в розмітці, але не на екрані.
	-->
	<h1 class="sr-only">
		{SITE.name} — жіночий одяг: сукні, костюми, верхній одяг з доставкою по Україні
	</h1>

	<HeroSlider banners={data.banners} />
</div>

{#if data.categories.length}
	<section class="mx-auto max-w-6xl px-4 py-16 md:py-20">
		<CategoryStrip categories={data.categories} />
	</section>
{/if}

{#if data.newArrivals.length}
	<section class="mx-auto max-w-6xl px-4 pb-20 md:pb-24">
		<SectionHeading
			eyebrow="Щойно завезли"
			title="Новинки"
			link={{ label: 'Усі новинки', href: '/catalog?sort=new' }}
		>
			Речі, які приїхали цього тижня. Розміри розбирають першими.
		</SectionHeading>

		<ProductGrid products={data.newArrivals} />
	</section>
{/if}

{#if data.sale.length}
	<section class="bg-brand-soft/50 py-20 md:py-24">
		<div class="mx-auto max-w-6xl px-4">
			<SectionHeading
				eyebrow="Вигідно"
				title="Знижки"
				link={{ label: 'Усі знижки', href: '/catalog?sale=1' }}
			>
				Останні розміри з попередніх колекцій за новою ціною.
			</SectionHeading>

			<ProductGrid products={data.sale} />
		</div>
	</section>
{/if}

{#if data.featured.length}
	<section class="mx-auto max-w-6xl px-4 py-20 md:py-24">
		<SectionHeading
			eyebrow="Обране"
			title="Бестселери сезону"
			link={{ label: 'До каталогу', href: '/catalog' }}
		>
			Те, що беруть найчастіше й повертають найрідше.
		</SectionHeading>

		<ProductGrid products={data.featured} />
	</section>
{/if}

<section class="border-t">
	<div class="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:grid-cols-3">
		{#each assurances as item, index (item.title)}
			<div use:reveal={{ delay: index * 80 }}>
				<h3 class="font-heading text-lg">{item.title}</h3>
				<p class="mt-2 text-sm text-muted-foreground">{item.text}</p>
			</div>
		{/each}
	</div>
</section>

<section class="mx-auto max-w-6xl px-4 pb-24 text-center">
	<div use:reveal>
		<h2 class="font-heading text-3xl md:text-4xl">Не знаєте, з чого почати?</h2>
		<p class="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
			Подивіться весь каталог — фільтри за розміром і кольором покажуть тільки те, що є в наявності.
		</p>
		<Button href="/catalog" size="lg" class="mt-6">До каталогу</Button>
	</div>
</section>
