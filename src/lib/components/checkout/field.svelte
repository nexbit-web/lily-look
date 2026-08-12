<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { Snippet } from 'svelte';

	/**
	 * Обгортка поля: підпис, зірочка обов'язковості, підказка й помилка.
	 * Тримає весь стан «як показувати помилку» в одному місці, щоб форма
	 * не обростала копіпастою з трьох рядків біля кожного інпута.
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

<div class="space-y-2">
	<Label for={id} class={cn('gap-1', error && 'text-destructive')}>
		{label}
		{#if required}
			<span class="text-destructive" aria-hidden="true">*</span>
		{:else}
			<span class="font-normal text-muted-foreground">(не обов’язково)</span>
		{/if}
	</Label>

	{@render children()}

	{#if error}
		<p class="flex items-center gap-1.5 text-xs text-destructive" role="alert">
			<TriangleAlertIcon class="size-3.5 shrink-0" />
			{error}
		</p>
	{:else if hint}
		<p class="text-xs text-muted-foreground">{hint}</p>
	{/if}
</div>
