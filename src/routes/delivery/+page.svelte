<script lang="ts">
	import InfoPage from '$lib/components/layout/info-page.svelte';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import { FREE_DELIVERY_FROM, SITE } from '$lib/config';
	import { formatPrice } from '$lib/money';
	import { deliveryTerms, FACTS } from '$lib/store-facts';

	const terms = deliveryTerms();
</script>

<PageMeta
	title="Доставка і оплата — {SITE.name}"
	description="Доставка Новою Поштою й Укрпоштою по всій Україні, безкоштовно від {formatPrice(
		FREE_DELIVERY_FROM
	)}. Оплата при отриманні, без передоплати."
	canonical="/delivery"
/>

<InfoPage
	title="Доставка і оплата"
	lead="Відправляємо по всій Україні, а платите ви вже після того, як побачили замовлення."
>
	<section aria-labelledby="delivery-heading">
		<h2 id="delivery-heading" class="font-heading text-2xl">Доставка</h2>
		<p class="mt-3 text-muted-foreground">{FACTS.dispatch} {FACTS.origin}</p>

		<!-- Таблиця, а не картки: три стовпці однакових фактів порівнюють
		     рядком, і так само їх розбирає пошуковик. -->
		<table class="mt-6 w-full text-sm">
			<caption class="sr-only">Способи доставки, вартість і строки</caption>
			<thead>
				<tr class="border-b text-left text-muted-foreground">
					<th scope="col" class="py-3 pr-4 font-normal">Спосіб</th>
					<th scope="col" class="py-3 pr-4 font-normal">Вартість</th>
					<th scope="col" class="py-3 font-normal">Строк</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each terms as term (term.label)}
					<tr>
						<th scope="row" class="py-3 pr-4 text-left font-medium">{term.label}</th>
						<td class="py-3 pr-4 tabular-nums">{term.price}</td>
						<td class="py-3">{term.time}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<p class="mt-6 rounded-lg bg-muted/60 px-4 py-3 text-sm">{FACTS.freeDelivery}</p>
		<p class="mt-4 text-sm text-muted-foreground">
			Точну дату отримання видно на сторінці кожного товару — вона рахується від сьогоднішнього дня
			й години замовлення.
		</p>
	</section>

	<section aria-labelledby="payment-heading">
		<h2 id="payment-heading" class="font-heading text-2xl">Оплата</h2>
		<p class="mt-3 text-muted-foreground">{FACTS.payment}</p>
		<p class="mt-3 text-muted-foreground">
			Не підійшло — можна відмовитись прямо на пошті або повернути річ пізніше: {FACTS.returns.toLowerCase()}
			<a href="/returns" class="text-foreground underline underline-offset-4">Умови повернення</a>
		</p>
	</section>
</InfoPage>
