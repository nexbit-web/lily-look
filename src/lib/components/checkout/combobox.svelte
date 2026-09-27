<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { AutocompleteOption } from '$lib/types';
	import { cn } from '$lib/utils';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { untrack } from 'svelte';

	/**
	 * Поле з підказками: покупець друкує прямо в ньому, а під ним випадає
	 * список із довідника.
	 *
	 * Раніше тут була кнопка, яка відкривала окреме вікно зі своїм рядком
	 * пошуку. На телефоні воно ламало сторінку: шрифт у тому рядку був
	 * 14 px, а iPhone на фокусі поля дрібніше за 16 px збільшує всю
	 * сторінку й так її й лишає; саме вікно ще й перераховувало позицію,
	 * коли виїжджала клавіатура. Тепер поле те саме, що й решта форми
	 * (`field-input`, 17 px), а список — звичайний блок під ним.
	 *
	 * У форму йде лише те, що обрали зі списку (прихований інпут нижче):
	 * надруковане від руки «Київ» без вибору довідник не впізнає, і
	 * менеджер отримав би адресу, якої не існує.
	 */
	let {
		id,
		/** Підказка в порожньому полі, видно у фокусі. */
		placeholder,
		/** Ім'я поля, яке піде у form action (людиночитна назва). */
		name,
		search,
		disabled = false,
		invalid = false,
		emptyText = 'Нічого не знайшли',
		/** Скільки символів чекати перед запитом. 0 — список одразу у фокусі. */
		minChars = 2,
		selected = $bindable<AutocompleteOption | null>(null)
	}: {
		id: string;
		placeholder: string;
		name: string;
		search: (query: string) => Promise<AutocompleteOption[]>;
		disabled?: boolean;
		invalid?: boolean;
		emptyText?: string;
		minChars?: number;
		selected?: AutocompleteOption | null;
	} = $props();

	const listId = $derived(`${id}-list`);

	let text = $state('');
	let open = $state(false);
	let options = $state<AutocompleteOption[]>([]);
	let loading = $state(false);
	let failed = $state('');
	/** Підсвічений рядок для стрілок на клавіатурі. -1 — жоден. */
	let active = $state(-1);
	/** Покупець щось друкує й ще не обрав зі списку. */
	let editing = false;
	let input = $state<HTMLInputElement>();

	/** Токен гонки: відповідь на застарілий запит ігнорується. */
	let requestId = 0;
	let debounce: ReturnType<typeof setTimeout> | undefined;

	const tooShort = $derived(text.trim().length < minChars);

	// Вибір змінився ззовні (змінили місто — відділення скинулось): поле
	// показує обране. Поки покупець друкує, його текст не чіпаємо.
	$effect(() => {
		const label = selected?.label ?? '';
		untrack(() => {
			if (selected || !editing) text = label;
		});
	});

	async function run(term: string) {
		const current = ++requestId;
		loading = true;
		failed = '';
		try {
			const result = await search(term);
			if (current !== requestId) return;
			options = result;
			active = -1;
		} catch (cause) {
			if (current !== requestId) return;
			options = [];
			failed = cause instanceof Error ? cause.message : 'Не вдалося завантажити список';
		} finally {
			if (current === requestId) loading = false;
		}
	}

	function onInput(event: Event & { currentTarget: HTMLInputElement }) {
		text = event.currentTarget.value;
		editing = true;
		// Почали правити обране — воно більше не дійсне, доки не оберуть знову.
		if (selected) selected = null;
		open = true;
		clearTimeout(debounce);
		if (text.trim().length < minChars) {
			requestId++;
			options = [];
			loading = false;
			return;
		}
		loading = true;
		debounce = setTimeout(() => run(text.trim()), 250);
	}

	function onFocus(event: FocusEvent & { currentTarget: HTMLInputElement }) {
		open = true;
		// Обране виділяємо цілком: почав друкувати — одразу замінив.
		if (selected) event.currentTarget.select();
		if (minChars === 0 && options.length === 0 && !loading) run(editing ? text.trim() : '');
		keepInView();
	}

	/**
	 * На телефоні клавіатура забирає пів екрана, і список під полем опинився
	 * б під нею. Підкручуємо поле ближче до верху — вже після того, як
	 * клавіатура виїхала й браузер сам прокрутив сторінку.
	 */
	function keepInView() {
		if (!window.matchMedia?.('(pointer: coarse)').matches) return;
		setTimeout(() => input?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
	}

	function choose(option: AutocompleteOption) {
		selected = option;
		text = option.label;
		editing = false;
		open = false;
		active = -1;
		// Обрали пальцем — ховаємо клавіатуру: далі друкувати тут нічого.
		input?.blur();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			open = true;
			if (options.length === 0) return;
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + options.length) % options.length;
			document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
		} else if (event.key === 'Enter') {
			// Enter у полі з підказками — вибір, а не відправка всієї форми.
			if (!open || options.length === 0) return;
			event.preventDefault();
			choose(options[Math.max(active, 0)]);
		} else if (event.key === 'Escape' && open) {
			event.preventDefault();
			open = false;
		}
	}

	function onBlur() {
		open = false;
		active = -1;
	}
</script>

<input
	bind:this={input}
	{id}
	class="field-input scroll-mt-24 pr-11"
	type="text"
	role="combobox"
	aria-autocomplete="list"
	aria-controls={listId}
	aria-expanded={open}
	aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
	aria-invalid={invalid}
	autocomplete="off"
	autocapitalize="sentences"
	spellcheck="false"
	enterkeyhint="done"
	{placeholder}
	{disabled}
	value={text}
	oninput={onInput}
	onfocus={onFocus}
	onblur={onBlur}
	onkeydown={onKeydown}
/>

<span
	class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground"
	aria-hidden="true"
>
	{#if loading && open}
		<LoaderIcon class="size-4 animate-spin" />
	{:else}
		<ChevronDownIcon class={cn('size-4 transition-transform', open && 'rotate-180')} />
	{/if}
</span>

{#if open && !disabled}
	<!--
		Список під полем. `pointerdown` гасимо, щоб поле не втратило фокус
		раніше, ніж спрацює вибір: інакше список зник би з-під пальця.
	-->
	<div
		id={listId}
		role="listbox"
		tabindex="-1"
		class="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
		onpointerdown={(event) => event.preventDefault()}
	>
		{#if loading}
			<!-- Скелетон замість спінера: видно, скільки рядків прилетить -->
			<div class="space-y-1 p-1" aria-hidden="true">
				{#each { length: 4 }, row (row)}
					<div class="space-y-1.5 px-3 py-2.5">
						<Skeleton class="h-3.5 w-2/3 rounded-md" />
						<Skeleton class="h-2.5 w-1/3 rounded-md" />
					</div>
				{/each}
			</div>
		{:else if failed}
			<p class="flex items-start gap-2 px-3 py-4 text-sm text-destructive" role="alert">
				<TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
				{failed}
			</p>
		{:else if tooShort}
			<p class="px-3 py-4 text-sm text-muted-foreground">Почніть вводити назву</p>
		{:else if options.length === 0}
			<p class="px-3 py-4 text-sm text-muted-foreground">{emptyText}</p>
		{:else}
			{#each options as option, index (option.ref)}
				<button
					id="{id}-option-{index}"
					type="button"
					role="option"
					tabindex="-1"
					aria-selected={index === active}
					class={cn(
						'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
						index === active ? 'bg-accent' : 'hover:bg-accent/60'
					)}
					onclick={() => choose(option)}
				>
					<!-- Довгі назви відділень переносяться, а не розпирають екран -->
					<span class="min-w-0 flex-1">
						<span class="line-clamp-2 text-[0.9375rem] leading-snug break-words">
							{option.label}
						</span>
						{#if option.hint}
							<span class="mt-0.5 block truncate text-xs text-muted-foreground">
								{option.hint}
							</span>
						{/if}
					</span>
					{#if selected?.ref === option.ref}
						<CheckIcon class="mt-0.5 size-4 shrink-0 text-success" />
					{/if}
				</button>
			{/each}
		{/if}
	</div>
{/if}

<!-- У form action їде людиночитна назва — менеджеру потрібна саме вона -->
<input type="hidden" {name} value={selected?.label ?? ''} />
