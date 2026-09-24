<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import CategoryFeed from '$lib/components/home/category-feed.svelte';
	import CategoryStrip from '$lib/components/home/category-strip.svelte';
	import HeroSlider from '$lib/components/home/hero-slider.svelte';
	import SectionHeading from '$lib/components/home/section-heading.svelte';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import { Button } from '$lib/components/ui/button';
	import { FREE_DELIVERY_FROM, RETURN_DAYS, SITE } from '$lib/config';
	import { DISPATCH_CUTOFF_HOUR } from '$lib/delivery-estimate';
	import { formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Скільки стрічок категорій уже приїхало з сервером — з них і починається
	 * стрічка на клієнті. Число рахується з даних, а не дублюється константою:
	 * розійтись із сервером воно не може.
	 */
	const readySections = $derived(data.sections.filter((section) => section.products).length);

	/**
	 * Що магазин продає — зі справжнього каталогу, а не зашитим списком.
	 *
	 * Цей рядок йде в h1 і в опис у видачі, і саме його перекаже ІІ-асистент
	 * на «що продає LILY LOOK». Зашиті «сукні й трикотаж» брехали б, щойно їх
	 * розібрали. Беремо найнаповненіші категорії: вони й є обличчям асортименту.
	 */
	const assortment = $derived(
		[...data.categories]
			.sort((a, b) => b.productCount - a.productCount)
			.slice(0, 4)
			.map((category) => category.name.toLowerCase())
			.join(', ') || 'верхній одяг'
	);

	/** Аргументи проти вагання — рівно ті, через які кидають кошик. */
	const assurances = [
		{
			title: `Безкоштовна доставка від ${formatPrice(FREE_DELIVERY_FROM)}`,
			text: `Нова Пошта по всій Україні, відправка того ж дня до ${DISPATCH_CUTOFF_HOUR}:00.`
		},
		{
			title: `Обмін і повернення ${RETURN_DAYS} ${plural(RETURN_DAYS, 'день', 'дні', 'днів')}`,
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
	description="Жіночий одяг {SITE.name}: {assortment}. Доставка Новою Поштою по всій Україні, оплата при отриманні, обмін і повернення {RETURN_DAYS} {plural(
		RETURN_DAYS,
		'день',
		'дні',
		'днів'
	)}."
	canonical="/"
	image={data.shareImage}
/>

<!--
	Поля банера на телефоні вужчі, ніж у решти сторінки (8 px замість 16):
	на екрані 375 px банер виходить рівно 359×166, як задумано в макеті.
-->
<div class="mx-auto max-w-6xl px-2 pt-2 md:px-4">
	<!--
		Заголовок сторінки потрібен і пошуковику, і скрінрідеру, але візуально
		його роль виконує банер: писати те саме двічі — псувати композицію.
		Тому h1 лишається в розмітці, але не на екрані.
	-->
	<h1 class="sr-only">
		{SITE.name} — жіночий одяг: {assortment} з доставкою по Україні
	</h1>

	<HeroSlider banners={data.banners} />
</div>

{#if data.categories.length}
	<section class="mx-auto max-w-6xl px-4 py-10 md:py-14" aria-label="Категорії">
		<CategoryStrip categories={data.categories} />
	</section>
{/if}

{#if data.sale.length}
	<section class="bg-brand-soft/50 py-10 md:py-14" aria-labelledby="sale-heading">
		<div class="mx-auto max-w-6xl px-4">
			<SectionHeading
				eyebrow="Вигідно"
				title="Знижки"
				titleId="sale-heading"
				link={{ label: 'Усі знижки', href: '/catalog?sale=1' }}
			>
				Останні розміри з попередніх колекцій за новою ціною.
			</SectionHeading>

			<ProductGrid products={data.sale} />
		</div>
	</section>
{/if}

{#if data.newArrivals.length}
	<section class="mx-auto max-w-6xl px-4 py-10 md:py-14" aria-labelledby="new-heading">
		<SectionHeading
			eyebrow="Щойно завезли"
			title="Новинки"
			titleId="new-heading"
			link={{ label: 'Усі новинки', href: '/catalog?sort=new' }}
		>
			Речі, які приїхали цього тижня. Розміри розбирають першими.
		</SectionHeading>

		<ProductGrid products={data.newArrivals} />
	</section>
{/if}

<!--
	Далі — увесь асортимент полицями, у тому порядку, в якому категорії
	стоять у CRM. Стрічки додаються по мірі прокрутки, тож кількість
	категорій не впливає ні на швидкість відкриття головної, ні на те,
	яку висоту показує смуга прокрутки в першу секунду.
-->
<CategoryFeed sections={data.sections} initial={readySections} />

<section class="border-t">
	<div class="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
		{#each assurances as item, index (item.title)}
			<div use:reveal={{ delay: index * 80 }}>
				<h2 class="font-heading text-lg">{item.title}</h2>
				<p class="mt-2 text-sm text-muted-foreground">{item.text}</p>
			</div>
		{/each}
	</div>
</section>

<section class="mx-auto max-w-6xl px-4 py-14 text-center">
	<div use:reveal>
		<h2 class="font-heading text-3xl md:text-4xl">Не знайшли своє?</h2>
		<p class="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
			У каталозі фільтри за розміром і кольором — покажуть тільки те, що є в наявності.
		</p>
		<Button href="/catalog" size="lg" class="mt-6">До каталогу</Button>
	</div>
</section>
