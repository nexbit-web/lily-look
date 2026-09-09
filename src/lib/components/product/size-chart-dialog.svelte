<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { sizeChartFor } from '$lib/config';
	import { cn } from '$lib/utils';
	import RulerIcon from '@lucide/svelte/icons/ruler';

	let { categorySlug, selectedSize = '' }: { categorySlug: string; selectedSize?: string } =
		$props();

	const chart = $derived(sizeChartFor(categorySlug));

	/**
	 * Заміри — це числа, і читаються вони колонками. Тому шапка тримається
	 * зверху при прокрутці, а обраний розмір підсвічений: покупець звіряє
	 * свій рядок, не гублячи, де він.
	 */
	const columns = [
		{ key: 'ua', title: 'UA' },
		{ key: 'chest', title: 'Груди' },
		{ key: 'sleeve', title: 'Рукав' },
		{ key: 'length', title: 'Довжина' }
	] as const;
</script>

<Dialog.Root>
	<Dialog.Trigger
		class="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
	>
		<RulerIcon class="size-3.5" />
		Таблиця розмірів
	</Dialog.Trigger>

	<Dialog.Content class="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
		<Dialog.Header class="border-b px-6 py-5">
			<!-- Заголовок без засічок і без капсу: у вендореному компоненті
			     вони прописані за замовчуванням, тут вони зайві. -->
			<Dialog.Title class="font-sans text-lg font-medium tracking-tight normal-case">
				{chart.title}
			</Dialog.Title>
			<Dialog.Description class="text-left text-xs">{chart.note}</Dialog.Description>
		</Dialog.Header>

		<!-- Таблиця ширша за модалку на мобільному — скролиться всередині себе -->
		<div class="max-h-[60vh] overflow-auto">
			<table class="w-full border-collapse text-sm">
				<thead class="sticky top-0 z-10 bg-background">
					<tr class="text-left text-xs tracking-[0.08em] text-muted-foreground uppercase">
						<th class="border-b py-3 pr-3 pl-6 font-normal">Розмір</th>
						{#each columns as column (column.key)}
							<th class="border-b py-3 pr-3 font-normal last:pr-6">{column.title}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each chart.rows as row (row.size)}
						{@const active = row.size === selectedSize}
						<tr class={cn('border-b last:border-0', active && 'bg-brand-soft/50')}>
							<td class="py-3 pr-3 pl-6">
								<span
									class={cn(
										'inline-flex h-7 min-w-9 items-center justify-center rounded-md px-2 text-xs',
										active ? 'bg-foreground text-background' : 'ring-1 ring-border ring-inset'
									)}
								>
									{row.size}
								</span>
							</td>
							{#each columns as column (column.key)}
								<td class="py-3 pr-3 tabular-nums last:pr-6">{row[column.key]}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Dialog.Content>
</Dialog.Root>
