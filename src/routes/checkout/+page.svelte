<script lang="ts">
	import CheckoutForm from '$lib/components/checkout/checkout-form.svelte';
	import CheckoutSkeleton from '$lib/components/checkout/checkout-skeleton.svelte';
	import { SITE } from '$lib/config';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const serverErrors = $derived((form?.errors ?? {}) as Record<string, string>);
	const serverMessage = $derived(String(form?.message ?? ''));
</script>

<svelte:head>
	<title>Оформлення замовлення — {SITE.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-10">
	<h1 class="font-heading text-4xl">Оформлення замовлення</h1>

	<!-- Кошик приїжджає стрімом — до того часу показуємо каркас -->
	{#await data.cart}
		<CheckoutSkeleton />
	{:then cart}
		<CheckoutForm {cart} novaPoshtaLive={data.novaPoshtaLive} {serverErrors} {serverMessage} />
	{/await}
</div>
