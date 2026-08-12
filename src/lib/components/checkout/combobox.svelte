<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { AutocompleteOption } from '$lib/types';
	import { cn } from '$lib/utils';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { tick } from 'svelte';

	let {
		id,
		placeholder,
		searchPlaceholder,
		/** Ім'я поля, яке піде у form action (людиночитна назва). */
		name,
		search,
		disabled = false,
		invalid = false,
		emptyText = 'Нічого не знайшли',
		/** Скільки символів чекати перед запитом. 0 — вантажити одразу. */
		minChars = 2,
		selected = $bindable<AutocompleteOption | null>(null)
	}: {
		id: string;
		placeholder: string;
		searchPlaceholder: string;
		name: string;
		search: (query: string) => Promise<AutocompleteOption[]>;
		disabled?: boolean;
		invalid?: boolean;
		emptyText?: string;
		minChars?: number;
		selected?: AutocompleteOption | null;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let options = $state<AutocompleteOption[]>([]);
	let loading = $state(false);
	let failed = $state('');

	/** Токен гонки: відповідь на застарілий запит ігнорується. */
	let requestId = 0;
	let debounce: ReturnType<typeof setTimeout> | undefined;

	async function run(term: string) {
		const current = ++requestId;
		loading = true;
		failed = '';
		try {
			const result = await search(term);
			if (current !== requestId) return;
			options = result;
		} catch (cause) {
			if (current !== requestId) return;
			options = [];
			failed = cause instanceof Error ? cause.message : 'Не вдалося завантажити список';
		} finally {
			if (current === requestId) loading = false;
		}
	}

	function onQueryChange(value: string) {
		query = value;
		clearTimeout(debounce);
		if (value.trim().length < minChars) {
			options = [];
			loading = false;
			return;
		}
		loading = true;
		debounce = setTimeout(() => run(value), 250);
	}

	async function onOpenChange(next: boolean) {
		open = next;
		if (!next) return;
		query = '';
		if (minChars === 0) {
			// Відділення показуємо одразу — вводити нічого не потрібно.
			await tick();
			run('');
		} else {
			options = [];
		}
	}

	// Скидання ззовні (напр. змінили місто) чистить і внутрішній стан.
	$effect(() => {
		if (!selected) {
			options = [];
			query = '';
		}
	});
</script>

<Popover.Root bind:open onOpenChange={(value) => onOpenChange(value)}>
	<Popover.Trigger {disabled}>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				variant="outline"
				role="combobox"
				aria-expanded={open}
				{disabled}
				class={cn(
					'h-11 w-full justify-between px-4 text-sm font-normal tracking-normal normal-case',
					!selected && 'text-muted-foreground',
					invalid && 'border-destructive ring-2 ring-destructive/20'
				)}
			>
				<span class="truncate">{selected?.label ?? placeholder}</span>
				<ChevronDownIcon class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root shouldFilter={false}>
			<Command.Input
				placeholder={searchPlaceholder}
				value={query}
				oninput={(event) => onQueryChange(event.currentTarget.value)}
			/>

			<Command.List class="max-h-72">
				{#if loading}
					<!-- Скелетон замість спінера: видно, скільки рядків прилетить -->
					<div class="space-y-2 p-2">
						{#each { length: 5 }, row (row)}
							<div class="space-y-1.5 px-2 py-1.5">
								<Skeleton class="h-3.5 w-2/3 rounded-md" />
								<Skeleton class="h-2.5 w-1/3 rounded-md" />
							</div>
						{/each}
					</div>
				{:else if failed}
					<div class="flex items-start gap-2 px-4 py-6 text-sm text-destructive" role="alert">
						<TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
						{failed}
					</div>
				{:else if query.trim().length < minChars}
					<p class="px-4 py-8 text-center text-sm text-muted-foreground">
						Введіть щонайменше {minChars} символи
					</p>
				{:else}
					<Command.Empty>{emptyText}</Command.Empty>
					<Command.Group>
						{#each options as option (option.ref)}
							<Command.Item
								value={option.ref}
								onSelect={() => {
									selected = option;
									open = false;
								}}
								class="items-start gap-3 py-2.5"
							>
								<CheckIcon
									class={cn(
										'mt-0.5 size-4 shrink-0',
										selected?.ref === option.ref ? 'opacity-100' : 'opacity-0'
									)}
								/>
								<span class="min-w-0 flex-1">
									<span class="block truncate">{option.label}</span>
									{#if option.hint}
										<span class="block truncate text-xs text-muted-foreground">{option.hint}</span>
									{/if}
								</span>
							</Command.Item>
						{/each}
					</Command.Group>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>

<!-- У form action їде людиночитна назва — менеджеру потрібна саме вона -->
<input type="hidden" {name} value={selected?.label ?? ''} />
