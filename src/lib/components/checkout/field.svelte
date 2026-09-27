<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { Snippet } from 'svelte';

	/**
	 * Обгортка поля: підпис усередині поля, підказка й помилка під ним.
	 * Тримає весь стан «як показувати помилку» в одному місці, щоб форма
	 * не обростала копіпастою з трьох рядків біля кожного інпута.
	 *
	 * Саме поле передається дитиною й має клас `field-input` і placeholder:
	 * як піднімається підпис і чим підсвічується помилка — у `app.css`.
	 * Підпис іде в розмітці після поля — так він малюється поверх нього.
	 */
	let {
		id,
		label,
		error = '',
		hint = '',
		required = false,
		children
	}: {
		id: string;
		label: string;
		error?: string;
		hint?: string;
		required?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="space-y-1.5">
	<div class="field-box">
		{@render children()}
		<label for={id} class="field-label">
			{label}{#if !required}<span class="font-normal"> (не обов’язково)</span>{/if}
		</label>
	</div>

	{#if error}
		<p class="flex items-center gap-1.5 px-1 text-xs text-destructive" role="alert">
			<TriangleAlertIcon class="size-3.5 shrink-0" />
			{error}
		</p>
	{:else if hint}
		<p class="px-1 text-xs text-muted-foreground">{hint}</p>
	{/if}
</div>
