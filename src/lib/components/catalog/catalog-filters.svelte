<script lang="ts">
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { SORT_OPTIONS } from '$lib/config';
	import type { CatalogFacets } from '$lib/types';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		facets,
		sizes,
		colors,
		sort
	}: {
		facets: CatalogFacets;
		sizes: string[];
		colors: string[];
		sort: string;
	} = $props();

	/**
	 * Фільтри — звичайні посилання, а не JS-стан. Так вони працюють без
	 * JavaScript, індексуються пошуковиками і їх можна надіслати в месенджері.
	 */
	function toggleUrl(key: 'size' | 'color', value: string) {
		// Одноразовий об'єкт для складання рядка — реактивність тут ні до чого.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(page.url.searchParams);
		const current = params.getAll(key);
		params.delete(key);
		for (const item of current) {
			if (item !== value) params.append(key, item);
		}
		if (!current.includes(value)) params.append(key, value);
		params.delete('page');
		return `${page.url.pathname}?${params}`;
	}

	function sortUrl(value: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(page.url.searchParams);
		params.set('sort', value);
		params.delete('page');
		return `${page.url.pathname}?${params}`;
	}

	const hasFilters = $derived(sizes.length > 0 || colors.length > 0);
</script>

<div class="space-y-8">
	<section class="space-y-3">
		<h2 class="text-xs tracking-[0.15em] uppercase">Сортування</h2>
		<div class="flex flex-wrap gap-2">
			{#each SORT_OPTIONS as option (option.value)}
				<Button
					href={sortUrl(option.value)}
					variant={sort === option.value ? 'default' : 'outline'}
					size="sm"
					data-sveltekit-noscroll
				>
					{option.label}
				</Button>
			{/each}
		</div>
	</section>

	{#if facets.sizes.length}
		<section class="space-y-3">
			<h2 class="text-xs tracking-[0.15em] uppercase">Розмір</h2>
			<div class="flex flex-wrap gap-2">
				{#each facets.sizes as size (size)}
					<Button
						href={toggleUrl('size', size)}
						variant={sizes.includes(size) ? 'default' : 'outline'}
						size="sm"
						class="min-w-11"
						data-sveltekit-noscroll
					>
						{size}
					</Button>
				{/each}
			</div>
		</section>
	{/if}

	{#if facets.colors.length}
		<section class="space-y-3">
			<h2 class="text-xs tracking-[0.15em] uppercase">Колір</h2>
			<div class="flex flex-wrap gap-2">
				{#each facets.colors as color (color.name)}
					<Button
						href={toggleUrl('color', color.name)}
						variant={colors.includes(color.name) ? 'default' : 'outline'}
						size="sm"
						data-sveltekit-noscroll
					>
						{#if color.hex}
							<span
								class="size-3 rounded-full border"
								style="background-color: {color.hex}"
								aria-hidden="true"
							></span>
						{/if}
						{color.name}
					</Button>
				{/each}
			</div>
		</section>
	{/if}

	{#if hasFilters}
		<a
			href={page.url.pathname}
			class="inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
		>
			<XIcon class="size-3.5" />
			Скинути фільтри
			<Badge variant="secondary">{sizes.length + colors.length}</Badge>
		</a>
	{/if}
</div>
