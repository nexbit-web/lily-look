<script lang="ts">
	import Combobox from '$lib/components/checkout/combobox.svelte';
	import Field from '$lib/components/checkout/field.svelte';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { DELIVERY_METHODS, SENDER, isDeliveryFree, type DeliveryMethodValue } from '$lib/config';
	import type { AutocompleteOption, SettlementOption, WarehouseOption } from '$lib/types';
	import { cn } from '$lib/utils';
	import InfoIcon from '@lucide/svelte/icons/info';

	let {
		subtotal,
		errors,
		/** Чи заданий ключ НП: без нього адреса вводиться вручну. */
		novaPoshtaLive,
		method = $bindable<DeliveryMethodValue>('NOVA_POSHTA_BRANCH'),
		city = $bindable(''),
		address = $bindable('')
	}: {
		subtotal: number;
		errors: Record<string, string>;
		novaPoshtaLive: boolean;
		method?: DeliveryMethodValue;
		city?: string;
		address?: string;
	} = $props();

	let settlement = $state<AutocompleteOption | null>(null);
	let warehouse = $state<AutocompleteOption | null>(null);

	const selected = $derived(
		DELIVERY_METHODS.find((item) => item.value === method) ?? DELIVERY_METHODS[0]
	);
	/** Автопідбір працює тільки для Нової Пошти й тільки з ключем. */
	const autocomplete = $derived(selected.carrier === 'nova-poshta' && novaPoshtaLive);

	// Комбобокси — джерело правди для батьківської форми: вона валідує
	// саме ці значення, незалежно від того, обрані вони зі списку чи вручну.
	$effect(() => {
		if (autocomplete) city = settlement?.label ?? '';
	});
	$effect(() => {
		if (autocomplete && selected.kind === 'branch') address = warehouse?.label ?? '';
	});

	// Змінили місто — старе відділення більше не дійсне.
	$effect(() => {
		void settlement?.ref;
		warehouse = null;
	});

	// Самовивіз не потребує адреси зовсім.
	$effect(() => {
		if (selected.kind === 'pickup') {
			city = '';
			address = '';
			settlement = null;
		}
	});

	async function fetchItems<T>(url: string): Promise<T[]> {
		const response = await fetch(url);
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			throw new Error(body?.message ?? 'Сервіс Нової Пошти недоступний');
		}
		return ((await response.json()) as { items: T[] }).items;
	}

	async function searchSettlements(query: string): Promise<AutocompleteOption[]> {
		const items = await fetchItems<SettlementOption>(
			`/api/nova-poshta/settlements?q=${encodeURIComponent(query)}`
		);
		return items.map((item) => ({
			ref: item.ref,
			cityRef: item.cityRef,
			label: item.name,
			hint: item.region
		}));
	}

	async function searchWarehouses(query: string): Promise<AutocompleteOption[]> {
		if (!settlement) return [];
		const items = await fetchItems<WarehouseOption>(
			`/api/nova-poshta/warehouses?settlement=${encodeURIComponent(settlement.ref)}&q=${encodeURIComponent(query)}`
		);
		return items.map((item) => ({ ref: item.ref, label: item.description }));
	}
</script>

<section class="space-y-5">
	<div>
		<h2 class="font-heading text-xl">Доставка</h2>
		<p class="mt-1 text-sm text-muted-foreground">Оберіть, як вам зручніше отримати замовлення.</p>
	</div>

	<RadioGroup.Root bind:value={method as string} class="gap-3">
		{#each DELIVERY_METHODS as item (item.value)}
			{@const active = method === item.value}
			{@const free = isDeliveryFree(item.value, subtotal)}
			<label
				for="delivery-{item.value}"
				class={cn(
					'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors',
					active ? 'border-foreground bg-accent/50' : 'hover:border-muted-foreground'
				)}
			>
				<RadioGroup.Item id="delivery-{item.value}" value={item.value} />
				<span class="flex-1">
					<span class="block text-sm font-medium">{item.label}</span>
					<span class="block text-xs text-muted-foreground">{item.hint}</span>
				</span>
				<!-- Суму тарифу не називаємо: на пошті вона була б іншою (див. isDeliveryFree). -->
				<span
					class={cn(
						'shrink-0 text-right text-xs',
						free ? 'text-sm font-medium text-success' : 'text-muted-foreground'
					)}
				>
					{free ? 'Безкоштовно' : 'За тарифом перевізника'}
				</span>
			</label>
		{/each}
	</RadioGroup.Root>

	<!-- RadioGroup тримає значення у стані, а form action читає ці поля -->
	<input type="hidden" name="deliveryMethod" value={method} />

	{#if selected.kind === 'pickup'}
		<p class="rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground">
			Заберете за адресою: {SENDER.pickupAddress}. Працюємо {SENDER.pickupHours} — менеджер зателефонує,
			коли замовлення буде готове.
		</p>
	{:else if autocomplete}
		<div class="grid gap-4">
			<Field id="settlement" label="Місто або село" required error={errors.deliveryCity ?? ''}>
				<Combobox
					id="settlement"
					name="deliveryCity"
					placeholder="Оберіть населений пункт"
					searchPlaceholder="Почніть вводити назву…"
					search={searchSettlements}
					invalid={Boolean(errors.deliveryCity)}
					emptyText="Такого населеного пункту немає в довіднику"
					bind:selected={settlement}
				/>
			</Field>

			{#if selected.kind === 'branch'}
				<Field
					id="warehouse"
					label="Відділення"
					required
					error={errors.deliveryAddress ?? ''}
					hint={settlement ? '' : 'Список з’явиться після вибору міста'}
				>
					<Combobox
						id="warehouse"
						name="deliveryAddress"
						placeholder={settlement ? 'Оберіть відділення' : 'Спочатку оберіть місто'}
						searchPlaceholder="Номер або вулиця…"
						search={searchWarehouses}
						disabled={!settlement}
						invalid={Boolean(errors.deliveryAddress)}
						emptyText="Відділень не знайдено"
						minChars={0}
						bind:selected={warehouse}
					/>
				</Field>
			{:else}
				<Field id="deliveryAddress" label="Адреса" required error={errors.deliveryAddress ?? ''}>
					<input
						class="field-input"
						id="deliveryAddress"
						name="deliveryAddress"
						placeholder="Вулиця, будинок, квартира"
						autocomplete="street-address"
						aria-invalid={Boolean(errors.deliveryAddress)}
						bind:value={address}
					/>
				</Field>
			{/if}
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2">
			<Field id="deliveryCity" label="Місто або село" required error={errors.deliveryCity ?? ''}>
				<input
					class="field-input"
					id="deliveryCity"
					name="deliveryCity"
					placeholder="Одеса"
					autocomplete="address-level2"
					aria-invalid={Boolean(errors.deliveryCity)}
					bind:value={city}
				/>
			</Field>

			<Field
				id="deliveryAddress"
				label={selected.kind === 'courier' ? 'Адреса' : 'Відділення'}
				required
				error={errors.deliveryAddress ?? ''}
			>
				<input
					class="field-input"
					id="deliveryAddress"
					name="deliveryAddress"
					placeholder={selected.kind === 'courier' ? 'Вулиця, будинок' : 'Відділення № 12'}
					autocomplete="street-address"
					aria-invalid={Boolean(errors.deliveryAddress)}
					bind:value={address}
				/>
			</Field>
		</div>

		{#if selected.carrier === 'nova-poshta'}
			<p class="flex items-start gap-2 text-xs text-muted-foreground">
				<InfoIcon class="mt-0.5 size-3.5 shrink-0" />
				Автопідбір вимкнено: не заданий NOVA_POSHTA_API_KEY у .env.
			</p>
		{/if}
	{/if}
</section>
