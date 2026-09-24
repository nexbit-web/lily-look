<script lang="ts">
	import InfoPage from '$lib/components/layout/info-page.svelte';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import { RETURN_DAYS, SITE } from '$lib/config';
	import { daysLabel, FACTS } from '$lib/store-facts';

	/**
	 * Умови — ті, що дає закон «Про захист прав споживачів» (ст. 9) для
	 * одягу належної якості, і нічого понад них. Хто платить за зворотну
	 * доставку й як повертаються гроші, тут свідомо не написано: це рішення
	 * магазину, і вигадувати його за магазин не можна.
	 */
	const conditions = [
		'річ не була у використанні: її не носили й не прали;',
		'збережено товарний вигляд, бирки й ярлики;',
		'є документ про покупку — підійде накладна чи номер замовлення.'
	];
</script>

<PageMeta
	title="Обмін і повернення — {SITE.name}"
	description="Обмін і повернення одягу {SITE.name} протягом {daysLabel(
		RETURN_DAYS
	)}. Не підійшов розмір — обміняємо. Умови й порядок повернення."
	canonical="/returns"
/>

<InfoPage
	title="Обмін і повернення"
	lead="Не підійшов розмір чи фасон — обміняємо на інший або повернемо гроші."
>
	<section aria-labelledby="term-heading">
		<h2 id="term-heading" class="font-heading text-2xl">Строк</h2>
		<p class="mt-3 text-muted-foreground">
			{FACTS.returns} Відмовитись від посилки можна й одразу на пошті — якщо річ не сподобалась під час
			огляду, платити за неї не потрібно.
		</p>
	</section>

	<section aria-labelledby="conditions-heading">
		<h2 id="conditions-heading" class="font-heading text-2xl">Умови</h2>
		<p class="mt-3 text-muted-foreground">Повернути або обміняти річ можна, якщо:</p>
		<ul class="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
			{#each conditions as condition (condition)}
				<li>{condition}</li>
			{/each}
		</ul>
	</section>

	<section aria-labelledby="how-heading">
		<h2 id="how-heading" class="font-heading text-2xl">Як повернути</h2>
		<ol class="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
			<li>
				Напишіть або зателефонуйте нам — <a
					href="/contacts"
					class="text-foreground underline underline-offset-4">контакти тут</a
				>. Назвіть номер замовлення вигляду LL-XXXXXX — його показує сторінка, що відкривається
				після оформлення.
			</li>
			<li>Скажіть, що хочете: інший розмір, іншу річ чи повернення грошей.</li>
			<li>Відправте річ Новою Поштою — адресу відділення підкажемо.</li>
			<li>Щойно посилка приїде, відправимо обмін або повернемо гроші.</li>
		</ol>
	</section>
</InfoPage>
