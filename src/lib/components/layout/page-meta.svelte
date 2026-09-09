<script lang="ts">
	import { page } from '$app/state';
	import { CURRENCY, SITE } from '$lib/config';

	/**
	 * Мета-теги сторінки в одному місці.
	 *
	 * Тримати їх поруч із розміткою кожної сторінки — найшвидший спосіб
	 * розїхатись: десь забули canonical, десь опис лишився від сусіднього
	 * роуту. Тут набір фіксований, а сторінка передає тільки зміст.
	 */
	let {
		title,
		description,
		/** Абсолютний або відносний канонічний адрес. За замовчуванням — поточний. */
		canonical,
		image = null,
		/** Що на картинці — для тих, хто читає стрічку скрінрідером. */
		imageAlt = null,
		type = 'website',
		/**
		 * Ціна в копійках. Тільки для `type: 'product'`: соцмережі показують
		 * її прямо в картці посилання.
		 */
		price = null,
		/** `false` — сторінка не для індексу (кошик, чекаут, пошук). */
		index = true
	}: {
		title: string;
		description: string;
		canonical?: string;
		image?: string | null;
		imageAlt?: string | null;
		type?: 'website' | 'product';
		price?: number | null;
		index?: boolean;
	} = $props();

	const href = $derived(new URL(canonical ?? page.url.pathname, page.url.origin).href);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" {href} />
	<meta
		name="robots"
		content={index ? 'index, follow, max-image-preview:large' : 'noindex, follow'}
	/>

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE.name} />
	<meta property="og:locale" content="uk_UA" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={href} />
	{#if image}
		<meta property="og:image" content={image} />
		{#if imageAlt}
			<meta property="og:image:alt" content={imageAlt} />
		{/if}
		<meta name="twitter:card" content="summary_large_image" />
	{:else}
		<meta name="twitter:card" content="summary" />
	{/if}

	{#if type === 'product' && price !== null}
		<meta property="product:price:amount" content={(price / 100).toFixed(2)} />
		<meta property="product:price:currency" content={CURRENCY} />
	{/if}
</svelte:head>
