<script lang="ts">
	import { page } from '$app/state';
	import { SORT_OPTIONS } from '$lib/config';
	import { cn } from '$lib/utils';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';

	let { sort }: { sort: string } = $props();

	function sortUrl(value: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(page.url.searchParams);
		params.set('sort', value);
		params.delete('page');
		return `${page.url.pathname}?${params}`;
	}
</script>

<div
	class="inline-flex shrink-0 items-center gap-0.5 rounded-lg border p-0.5"
	role="group"
	aria-label="Сортування"
>
	{#each SORT_OPTIONS as option (option.value)}
		{@const active = sort === option.value}
		<a
			href={sortUrl(option.value)}
			title={option.hint}
			aria-label={option.hint}
			aria-current={active ? 'true' : undefined}
			data-sveltekit-noscroll
			class={cn(
				'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs whitespace-nowrap transition-colors',
				active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
			)}
		>
			{option.label}
			{#if option.direction === 'asc'}
				<ArrowUpIcon class="size-3" aria-hidden="true" />
			{:else if option.direction === 'desc'}
				<ArrowDownIcon class="size-3" aria-hidden="true" />
			{/if}
		</a>
	{/each}
</div>
