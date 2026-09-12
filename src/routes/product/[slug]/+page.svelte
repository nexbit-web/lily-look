<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import AddToCartForm from '$lib/components/product/add-to-cart-form.svelte';
	import ProductGallery from '$lib/components/product/product-gallery.svelte';
	import ProductGrid from '$lib/components/product/product-grid.svelte';
	import ProductInfo from '$lib/components/product/product-info.svelte';
	import { RETURN_DAYS, SITE } from '$lib/config';
	import { formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import { modelSku } from '$lib/sku';
	import { summarize } from '$lib/summary';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const product = $derived(data.product);
	const cover = $derived(product.images[0]?.url ?? '');
	// Опис для видачі: перше речення товару плюс те, що вирішує покупця
	// на місці — ціна й умови доставки. 90 символів на опис — щоб уся
	// стрічка вклалась у ті ~160, які Google показує без обрізання.
	const metaDescription = $derived(
		`${summarize(product.description, 90)} Ціна ${formatPrice(product.price)}. Доставка по Україні, обмін ${RETURN_DAYS} ${plural(RETURN_DAYS, 'день', 'дні', 'днів')}.`
	);
	const sku = $derived(modelSku(product.variants.map((variant) => variant.sku)));

	/**
	 * Обраний колір живе тут, бо його слухає галерея, а міняє — форма.
	 * Значення звіряється зі списком кольорів товару: після переходу на
	 * інший товар старий вибір просто перестає підходити, і галерея бере
	 * колір першого варіанта — той самий, що й форма.
	 */
	let picked = $state('');
	const galleryColor = $derived(
		product.variants.some((variant) => variant.color === picked)
			? picked
			: (product.variants[0]?.color ?? null)
	);
</script>

<PageMeta
	title="{product.name} — купити в Україні | {SITE.name}"
	description={metaDescription}
	canonical="/product/{product.slug}"
	image={cover || null}
	imageAlt={product.images[0]?.alt ?? product.name}
	type="product"
	price={product.price}
/>

<div class="mx-auto max-w-6xl px-4 pt-4 pb-10 md:pt-6 md:pb-14">
	<nav aria-label="Хлібні крихти" class="mb-6 text-[0.7rem] tracking-[0.06em] uppercase">
		<ol class="flex flex-wrap items-center gap-2 text-muted-foreground">
			<li><a href="/" class="transition-colors hover:text-foreground">Головна</a></li>
			<li aria-hidden="true">/</li>
			<li><a href="/catalog" class="transition-colors hover:text-foreground">Каталог</a></li>
			<li aria-hidden="true">/</li>
			<li>
				<a href="/catalog/{product.category.slug}" class="transition-colors hover:text-foreground">
					{product.category.name}
				</a>
			</li>
			<li aria-hidden="true">/</li>
			<li class="text-foreground" aria-current="page">{product.name}</li>
		</ol>
	</nav>

	<!--
		Фото займає більшу частину рядка (60/40): річ продає себе сама,
		а панелі купівлі вистачає й вужчої колонки. Панель липне до шапки, тож кнопка лишається перед
		очима, поки гортаєш опис; вона займає обидва рядки сітки, інакше
		sticky не мав би куди їхати.
	-->
	<article class="grid gap-10 lg:grid-cols-[3fr_2fr] lg:gap-16">
		<!-- key: при переході на інший товар вибір кольору/розміру має скинутись -->
		{#key product.id}
			<!-- На телефоні фото виходить за поля сторінки на всю ширину екрана:
			     річ видно більше, а поля лишаються там, де їх чекає шапка. -->
			<div class="max-sm:-mx-4 lg:col-start-1 lg:row-start-1">
				<ProductGallery images={product.images} name={product.name} color={galleryColor} />
			</div>

			<div class="lg:col-start-2 lg:row-span-2 lg:row-start-1">
				<div class="lg:sticky lg:top-20">
					<AddToCartForm
						{product}
						delivery={data.delivery}
						onColorChange={(color) => (picked = color)}
					/>
				</div>
			</div>

			<div class="lg:col-start-1 lg:row-start-2">
				<ProductInfo description={product.description} attributes={product.attributes} {sku} />
			</div>
		{/key}
	</article>

	{#if data.recommended.length}
		<section class="mt-24 md:mt-28" aria-labelledby="recommended-heading">
			<div class="mb-8 flex items-end justify-between gap-6" use:reveal>
				<div>
					<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">До цієї речі</p>
					<h2 id="recommended-heading" class="mt-2 font-heading text-3xl md:text-4xl">
						Вам також сподобається
					</h2>
				</div>

				<a
					href="/catalog/{product.category.slug}"
					class="group hidden shrink-0 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
				>
					Уся категорія
					<ArrowRightIcon
						class="size-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
						aria-hidden="true"
					/>
				</a>
			</div>

			<ProductGrid products={data.recommended} />
		</section>
	{/if}
</div>
