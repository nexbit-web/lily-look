<script lang="ts">
	import * as InputGroup from '$lib/components/ui/input-group';

	/**
	 * Телефон у форматі +38 0XX XXX XX XX.
	 *
	 * Префікс «+38» — статичний addon, його не можна стерти чи задублювати.
	 * Користувач вводить рівно 10 цифр національного номера, які на льоту
	 * розбиваються на групи. У форму йде нормалізоване «+380XXXXXXXXX».
	 */

	let {
		id = 'customerPhone',
		name = 'customerPhone',
		invalid = false,
		onblur,
		digits = $bindable('')
	}: {
		id?: string;
		name?: string;
		invalid?: boolean;
		onblur?: () => void;
		/** Рівно 10 цифр, перша — 0. */
		digits?: string;
	} = $props();

	/** 0671234567 → «067 123 45 67» */
	function format(value: string) {
		const groups = [value.slice(0, 3), value.slice(3, 6), value.slice(6, 8), value.slice(8, 10)];
		return groups.filter(Boolean).join(' ');
	}

	const display = $derived(format(digits));

	function onInput(event: Event & { currentTarget: HTMLInputElement }) {
		// Приймаємо будь-що, лишаємо цифри. Якщо вставили «+380…» або «380…»,
		// відкидаємо код країни — інакше номер поїде на розряд.
		let next = event.currentTarget.value.replace(/\D/g, '');
		if (next.startsWith('380')) next = next.slice(2);
		else if (next.startsWith('38')) next = next.slice(2);

		digits = next.slice(0, 10);
		// Повертаємо у поле відформатоване значення, щоб курсор не «стрибав».
		event.currentTarget.value = format(digits);
	}
</script>

<!-- Підсвітку помилки малює сам InputGroup за aria-invalid на інпуті —
     тільки нижньою рискою, як і решта полів пресета. -->
<InputGroup.Root>
	<InputGroup.Addon>
		<span class="font-medium text-foreground">+38</span>
	</InputGroup.Addon>
	<InputGroup.Input
		{id}
		type="tel"
		inputmode="numeric"
		autocomplete="tel-national"
		placeholder="067 123 45 67"
		value={display}
		aria-invalid={invalid}
		oninput={onInput}
		{onblur}
	/>
</InputGroup.Root>

<!-- У form action їде нормалізований номер, а не те, що набрав користувач -->
<input type="hidden" {name} value={digits.length === 10 ? `+38${digits}` : ''} />
