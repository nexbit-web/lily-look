<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Каркас інформаційних сторінок: доставка, повернення, контакти.
	 *
	 * Одна форма на всі три — щоб вони читались як розділи однієї довідки,
	 * а не три різні сайти, і щоб крихти й заголовок ніде не загубились.
	 */
	let { title, lead, children }: { title: string; lead: string; children: Snippet } = $props();
</script>

<div class="mx-auto max-w-3xl px-4 py-8 md:py-10">
	<nav aria-label="Хлібні крихти" class="mb-6 text-sm text-muted-foreground">
		<ol class="flex flex-wrap items-center gap-2">
			<li><a href="/" class="hover:text-foreground">Головна</a></li>
			<li aria-hidden="true">/</li>
			<li class="text-foreground" aria-current="page">{title}</li>
		</ol>
	</nav>

	<header class="mb-10">
		<h1 class="font-heading text-4xl">{title}</h1>
		<p class="mt-3 max-w-prose text-muted-foreground">{lead}</p>
	</header>

	<div class="space-y-12">
		{@render children()}
	</div>
</div>
