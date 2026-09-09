<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import { RETURN_DAYS } from '$lib/config';
	import { plural } from '$lib/plural';
	import type { ProductAttributeView } from '$lib/types';

	/**
	 * Опис товару й умови під ним.
	 *
	 * Опис розгорнутий одразу — він же й приходить у розмітку сторінки на
	 * сервері, тож пошуковик бачить текст товару без JS. Решта згорнута,
	 * щоб не топити сторінку в дрібному шрифті.
	 *
	 * Умов доставки тут немає свідомо: вони стоять у панелі купівлі, і
	 * дублювати їх удруге на тій самій сторінці — тільки плодити текст.
	 *
	 * Заголовки розділів — рівень 2: одразу під h1 товару, без стрибка
	 * через рівень, інакше структура сторінки для пошуковика рветься.
	 */

	let {
		description,
		attributes = [],
		sku
	}: { description: string; attributes?: ProductAttributeView[]; sku?: string | null } = $props();
</script>

<section aria-label="Про товар">
	<!-- multiple, а не single: відкрити доставку й через це втратити опис
	     товару — не те, чого чекає покупець. -->
	<Accordion.Root type="multiple" value={['description']} class="border-t">
		<Accordion.Item value="description">
			<Accordion.Trigger level={2} class="py-5 font-normal">Опис</Accordion.Trigger>
			<Accordion.Content class="text-muted-foreground">
				<p class="max-w-prose whitespace-pre-line">{description}</p>
				{#if sku}
					<p class="mt-5 text-xs tracking-[0.08em] text-muted-foreground/70 uppercase">
						Артикул: {sku}
					</p>
				{/if}
			</Accordion.Content>
		</Accordion.Item>

		<!-- Характеристики веде CRM довільним списком, тож тут немає
		     заздалегідь відомих полів: малюємо рівно те, що прийшло. -->
		{#if attributes.length}
			<Accordion.Item value="specs" id="specs">
				<Accordion.Trigger level={2} class="py-5 font-normal">Характеристики</Accordion.Trigger>
				<Accordion.Content class="text-muted-foreground">
					<dl class="max-w-prose divide-y border-t">
						{#each attributes as attribute (attribute.name)}
							<div
								class="grid grid-cols-[12rem_1fr] gap-x-4 py-3 max-sm:grid-cols-1 max-sm:gap-y-0.5"
							>
								<dt class="text-muted-foreground/80">{attribute.name}</dt>
								<dd class="text-foreground">{attribute.value}</dd>
							</div>
						{/each}
					</dl>
				</Accordion.Content>
			</Accordion.Item>
		{/if}

		<Accordion.Item value="returns">
			<Accordion.Trigger level={2} class="py-5 font-normal">Обмін і повернення</Accordion.Trigger>
			<Accordion.Content class="text-muted-foreground">
				<p class="max-w-prose">
					Не підійшов розмір або передумали — {RETURN_DAYS}
					{plural(RETURN_DAYS, 'день', 'дні', 'днів')} на обмін і повернення від моменту отримання. Річ
					має бути в тому ж вигляді: без слідів носіння, з бирками. Напишіть нам, і ми надішлемо інструкцію,
					як відправити посилку назад.
				</p>
			</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>
</section>
