<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ORDER_STATUS_LABELS, SITE, deliveryMethod } from '$lib/config';
	import { formatPrice } from '$lib/money';
	import CheckIcon from '@lucide/svelte/icons/check';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const order = $derived(data.order);
	const delivery = $derived(deliveryMethod(order.deliveryMethod));
</script>

<svelte:head>
	<title>Замовлення {order.number} — {SITE.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-16">
	<div class="text-center">
		<span
			class="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
		>
			<CheckIcon class="size-6" />
		</span>
		<h1 class="mt-6 font-heading text-3xl">Замовлення прийнято</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Номер замовлення — <span class="font-medium text-foreground">{order.number}</span>. Менеджер
			зателефонує найближчим часом.
		</p>
	</div>

	<div class="mt-12 space-y-6 rounded-lg border p-6">
		<div class="grid gap-4 text-sm sm:grid-cols-2">
			<div>
				<p class="text-xs tracking-[0.15em] text-muted-foreground uppercase">Статус</p>
				<p class="mt-1">{ORDER_STATUS_LABELS[order.status]}</p>
			</div>
			<div>
				<p class="text-xs tracking-[0.15em] text-muted-foreground uppercase">Отримувач</p>
				<p class="mt-1">{order.customerName}, {order.customerPhone}</p>
			</div>
			<div class="sm:col-span-2">
				<p class="text-xs tracking-[0.15em] text-muted-foreground uppercase">Доставка</p>
				<p class="mt-1">
					{delivery.label}
					{#if order.deliveryCity}
						· {order.deliveryCity}
					{/if}
					{#if order.deliveryAddress}
						, {order.deliveryAddress}
					{/if}
				</p>
			</div>
		</div>

		<ul class="divide-y border-t">
			{#each order.items as item (item.productSlug + item.size + item.color)}
				<li class="flex gap-4 py-4">
					<a
						href="/product/{item.productSlug}"
						class="size-16 shrink-0 overflow-hidden rounded-md bg-muted"
					>
						{#if item.imageUrl}
							<img src={item.imageUrl} alt={item.productName} class="size-full object-cover" />
						{/if}
					</a>
					<div class="flex flex-1 justify-between gap-4 text-sm">
						<div>
							<p>{item.productName}</p>
							<p class="mt-1 text-xs text-muted-foreground">
								{item.color} · {item.size} · {item.quantity} шт.
							</p>
						</div>
						<p class="tabular-nums">{formatPrice(item.unitPrice * item.quantity)}</p>
					</div>
				</li>
			{/each}
		</ul>

		<div class="space-y-2 border-t pt-4 text-sm">
			<div class="flex justify-between">
				<span class="text-muted-foreground">Товари</span>
				<span class="tabular-nums">{formatPrice(order.subtotal)}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-muted-foreground">Доставка</span>
				<span class="tabular-nums">
					{order.deliveryCost === 0 ? 'Безкоштовно' : formatPrice(order.deliveryCost)}
				</span>
			</div>
			<div class="flex justify-between border-t pt-2 text-base">
				<span>Разом</span>
				<span class="font-medium tabular-nums">{formatPrice(order.total)}</span>
			</div>
		</div>
	</div>

	<div class="mt-8 text-center">
		<Button href="/catalog" variant="outline">Продовжити покупки</Button>
	</div>
</div>
