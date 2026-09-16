<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import { cn } from '$lib/utils';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		titleId,
		link,
		children
	}: {
		/** Надзаголовок. Без нього лишається сама назва — так у стрічках категорій. */
		eyebrow?: string;
		title: string;
		/** Потрібен, коли секцію підписують через aria-labelledby. */
		titleId?: string;
		link?: { label: string; href: string };
		children?: Snippet;
	} = $props();
</script>

<!-- Однаковий заголовок на всі блоки головної: очі не перебудовуються
     між секціями, і сторінка читається як одне ціле. -->
<div class="mb-6 flex items-end justify-between gap-6" use:reveal>
	<div>
		{#if eyebrow}
			<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">{eyebrow}</p>
		{/if}
		<h2 id={titleId} class={cn('font-heading text-3xl md:text-4xl', eyebrow && 'mt-2')}>
			{title}
		</h2>
		{#if children}
			<p class="mt-2 max-w-md text-sm text-pretty text-muted-foreground">{@render children()}</p>
		{/if}
	</div>

	{#if link}
		<a
			href={link.href}
			class="group hidden shrink-0 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
		>
			{link.label}
			<ArrowRightIcon
				class="size-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
				aria-hidden="true"
			/>
		</a>
	{/if}
</div>
