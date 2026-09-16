<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import type { ProductMeasurementView } from '$lib/types';
	import { cn } from '$lib/utils';
	import RulerIcon from '@lucide/svelte/icons/ruler';

	/**
	 * Таблиця розмірів конкретної речі.
	 *
	 * Жодного довідника в коді: рядки — це заміри з бази, які веде CRM, у
	 * тому ж порядку. Тому в таблиці стоять саме ті розміри, що є в товару,
	 * — хоч «S/M», хоч «6XL», — а не універсальний ряд XS–XL.
	 */

	let {
		measurements,
		selectedSize = ''
	}: { measurements: ProductMeasurementView[]; selectedSize?: string } = $props();

	const COLUMNS = [
		{ key: 'ua', title: 'UA' },
		{ key: 'chest', title: 'Груди' },
		{ key: 'sleeve', title: 'Рукав' },
		{ key: 'length', title: 'Довжина' }
	] as const;

	/**
	 * Колонка з'являється, тільки якщо хоч в одному рядку є значення:
	 * у спідниці немає рукава, і порожній стовпчик лише збиває з пантелику.
	 */
	const columns = $derived(
		COLUMNS.filter((column) => measurements.some((row) => row[column.key] !== null))
	);
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
				Заміри виробу
			</Dialog.Title>
			<Dialog.Description class="text-left text-xs">
				Заміри самої речі в сантиметрах. UA — український розмір.
			</Dialog.Description>
		</Dialog.Header>

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
					{#each measurements as row (row.size)}
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
								<td class="py-3 pr-3 tabular-nums last:pr-6">{row[column.key] ?? '—'}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Dialog.Content>
</Dialog.Root>
