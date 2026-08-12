<script lang="ts">
	import CartLineItem from '$lib/components/cart/cart-line.svelte';
	import CartSummary from '$lib/components/cart/cart-summary.svelte';
	import EmptyCart from '$lib/components/cart/empty-cart.svelte';
	import { SITE } from '$lib/config';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Оптимістичний шар над даними з сервера.
	 *
	 * Поки запит летить, кількість і підсумки рахуються по тому, що користувач
	 * щойно натиснув. Коли load повертає свіжий кошик, рядок «відпускається»
	 * і знову показує серверну правду — якщо сервер обрізав кількість по
	 * залишку, це видно одразу.
	 */
	let quantities = $state<Record<string, number>>({});
	let removals = $state<Record<string, true>>({});

	const lines = $derived(
		data.cart.lines.map((line) => {
			const quantity = quantities[line.id] ?? line.quantity;
			return { ...line, quantity, lineTotal: line.unitPrice * quantity };
		})
	);

	// Позиція, яку видаляють, уже не впливає на суму, але лишається на екрані
	// до відповіді сервера — інакше рядок зник би разом із формою в польоті.
	const active = $derived(lines.filter((line) => !removals[line.id]));
	const subtotal = $derived(active.reduce((sum, line) => sum + line.lineTotal, 0));
	const count = $derived(active.reduce((sum, line) => sum + line.quantity, 0));

	function settle(id: string) {
		delete quantities[id];
		delete removals[id];
	}
</script>

<svelte:head>
	<title>Кошик{count > 0 ? ` (${count})` : ''} — {SITE.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<!-- Порожній кошик забирає весь екран і має власний заголовок -->
{#if lines.length === 0}
	<EmptyCart />
{:else}
	<div class="mx-auto max-w-4xl px-4 py-10">
		<div class="flex items-baseline justify-between gap-4">
			<h1 class="font-heading text-4xl">Кошик</h1>
			<a
				href="/catalog"
				class="text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				Продовжити покупки
			</a>
		</div>

		<div class="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
			<ul class="divide-y border-y">
				{#each lines as line (line.id)}
					<CartLineItem
						{line}
						removing={Boolean(removals[line.id])}
						onQuantity={(quantity) => (quantities[line.id] = quantity)}
						onRemove={() => (removals[line.id] = true)}
						onSettled={() => settle(line.id)}
					/>
				{/each}
			</ul>

			<CartSummary {subtotal} {count} />
		</div>
	</div>
{/if}
