<script lang="ts">
	import { page } from '$app/state';
	import type { CatalogFacets } from '$lib/types';
	import { cn } from '$lib/utils';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		facets,
		sizes,
		colors
	}: {
		facets: CatalogFacets;
		sizes: string[];
		colors: string[];
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

	const activeCount = $derived(sizes.length + colors.length);
</script>

<div class="space-y-7">
	{#if facets.sizes.length}
		<section class="space-y-3">
			<h2 class="text-xs tracking-[0.15em] text-muted-foreground uppercase">Розмір</h2>
			<div class="flex flex-wrap gap-1.5">
				{#each facets.sizes as size (size)}
					{@const active = sizes.includes(size)}
					<a
						href={toggleUrl('size', size)}
						aria-current={active ? 'true' : undefined}
						data-sveltekit-noscroll
						class={cn(
							'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-xs transition-colors',
							active
								? 'border-foreground bg-foreground text-background'
								: 'hover:border-foreground/40 hover:bg-accent'
						)}
					>
						{size}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if facets.colors.length}
		<section class="space-y-3">
			<h2 class="text-xs tracking-[0.15em] text-muted-foreground uppercase">Колір</h2>
			<!-- Кольорів може бути багато: тримаємо їх у власному блоці з
			     прокруткою, щоб панель не розтягувала сторінку вниз. -->
			<div class="scrollbar-hover max-h-44 overflow-y-auto pr-1">
				<div class="flex flex-wrap gap-2">
					{#each facets.colors as color (color.name)}
						{@const active = colors.includes(color.name)}
						<a
							href={toggleUrl('color', color.name)}
							title={color.name}
							aria-current={active ? 'true' : undefined}
							data-sveltekit-noscroll
							class={cn(
								'inline-flex items-center rounded-full ring-offset-background transition',
								active && 'ring-2 ring-foreground ring-offset-2'
							)}
						>
							{#if color.hex}
								<span
									class="size-7 rounded-full ring-1 ring-border ring-inset"
									style="background-color: {color.hex}"
									aria-hidden="true"
								></span>
								<!-- Назва тільки для скрінрідера: кружечок сам по собі німий.
								     Там, де назва вже видима, її не дублюємо. -->
								<span class="sr-only">{color.name}</span>
							{:else}
								<!-- Колір без коду показуємо назвою — краще, ніж порожній кружечок. -->
								<span class="rounded-full border px-2.5 py-1 text-xs">{color.name}</span>
							{/if}
						</a>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	{#if activeCount > 0}
		<a
			href={page.url.pathname}
			class="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
		>
			<XIcon class="size-3.5" />
			Скинути фільтри ({activeCount})
		</a>
	{/if}
</div>
