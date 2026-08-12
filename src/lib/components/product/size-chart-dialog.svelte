<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { SITE, sizeChartFor } from '$lib/config';
	import { cn } from '$lib/utils';
	import RulerIcon from '@lucide/svelte/icons/ruler';

	let { categorySlug, selectedSize = '' }: { categorySlug: string; selectedSize?: string } =
		$props();

	const chart = $derived(sizeChartFor(categorySlug));
</script>

<Dialog.Root>
	<Dialog.Trigger
		class="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
	>
		<RulerIcon class="size-3.5" />
		Таблиця розмірів
	</Dialog.Trigger>

	<Dialog.Content class="rounded-2xl sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title class="font-heading text-xl">{chart.title}</Dialog.Title>
			<Dialog.Description class="text-left">{chart.note}</Dialog.Description>
		</Dialog.Header>

		<!-- Таблиця ширша за модалку на мобільному — скролиться всередині себе -->
		<div class="-mx-2 overflow-x-auto px-2">
			<table class="w-full min-w-lg border-collapse text-sm">
				<thead>
					<tr class="border-b text-left text-muted-foreground">
						<th class="py-3 pr-4 font-normal">Розмір</th>
						<th class="py-3 pr-4 font-normal">UA</th>
						<th class="py-3 pr-4 font-normal">Груди</th>
						<th class="py-3 pr-4 font-normal">Рукав</th>
						<th class="py-3 pr-4 font-normal">Довжина</th>
						<th class="py-3 font-normal">Під низ</th>
					</tr>
				</thead>
				<tbody>
					{#each chart.rows as row (row.size)}
						<tr
							class={cn(
								'border-b last:border-0',
								// Обраний розмір підсвічуємо — легше звірити свої заміри
								row.size === selectedSize && 'bg-brand-soft/60'
							)}
						>
							<td class="py-3 pr-4 font-medium">{row.size}</td>
							<td class="py-3 pr-4 text-muted-foreground tabular-nums">{row.ua}</td>
							<td class="py-3 pr-4 tabular-nums">{row.chest}</td>
							<td class="py-3 pr-4 tabular-nums">{row.sleeve}</td>
							<td class="py-3 pr-4 tabular-nums">{row.length}</td>
							<td class="py-3 text-muted-foreground">{row.underneath}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="text-xs text-muted-foreground">
			Якщо ви між розмірами — беріть більший: у меншому светр з’їдає рух у плечах. Напишіть зріст і
			обхват грудей на
			<a href="mailto:{SITE.email}" class="text-foreground underline underline-offset-4">
				{SITE.email}
			</a>, порадимо конкретно.
		</p>
	</Dialog.Content>
</Dialog.Root>
