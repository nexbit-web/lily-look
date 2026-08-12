<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { CategoryLink } from '$lib/types';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	let { open = $bindable(false), categories }: { open?: boolean; categories: CategoryLink[] } =
		$props();

	let query = $state('');
	let input = $state<HTMLInputElement | null>(null);

	/** Швидкі посилання: перші категорії + сталі промо-запити. */
	const quickLinks = $derived([
		...categories.slice(0, 4).map((category) => ({
			label: category.name,
			href: `/catalog/${category.slug}`
		})),
		{ label: 'Новинки', href: '/catalog?sort=new' },
		{ label: 'Знижки', href: '/catalog?sale=1' }
	]);

	/** Підказки фільтруються прямо в оверлеї — без запиту на сервер. */
	const suggestions = $derived.by(() => {
		const term = query.trim().toLowerCase();
		if (!term) return [];
		return categories.filter((category) => category.name.toLowerCase().includes(term)).slice(0, 5);
	});

	$effect(() => {
		if (!open) return;
		// Фокус після того, як панель з'явилась, інакше Safari з'їдає його.
		requestAnimationFrame(() => input?.focus());
	});

	// Закриваємо панель після будь-якої навігації.
	$effect(() => {
		void page.url.href;
		open = false;
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const term = query.trim();
		if (!term) return;
		open = false;
		goto(`/catalog?q=${encodeURIComponent(term)}`);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') open = false;
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- Розмиття перекриває всю сторінку, включно з шапкою -->
	<div
		class="fixed inset-0 z-50 bg-background/40 backdrop-blur-xl"
		transition:fade={{ duration: 220 }}
	>
		<!-- Клік повз панель закриває пошук -->
		<button
			type="button"
			class="absolute inset-0 h-full w-full cursor-default"
			aria-label="Закрити пошук"
			onclick={() => (open = false)}
		></button>

		<div
			class="relative border-b bg-background/80 shadow-sm"
			transition:fly={{ y: -24, duration: 320, easing: cubicOut }}
		>
			<div class="mx-auto max-w-3xl px-6 py-10">
				<form onsubmit={submit}>
					<div class="flex items-center gap-4">
						<SearchIcon class="size-6 shrink-0 text-muted-foreground" />
						<input
							bind:this={input}
							bind:value={query}
							type="search"
							name="q"
							placeholder="Пошук на lilylook.ua"
							aria-label="Пошук товарів"
							class="w-full bg-transparent font-heading text-2xl outline-none placeholder:text-muted-foreground/60 md:text-3xl"
						/>
					</div>
				</form>

				<div class="mt-10">
					<p class="text-sm text-muted-foreground">
						{suggestions.length ? 'Категорії' : 'Швидкі посилання'}
					</p>

					<ul class="mt-4 space-y-1">
						{#each suggestions.length ? suggestions.map( (category) => ({ label: category.name, href: `/catalog/${category.slug}` }) ) : quickLinks as link (link.href)}
							<li>
								<a
									href={link.href}
									class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
								>
									<ArrowRightIcon
										class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
									/>
									{link.label}
								</a>
							</li>
						{/each}

						{#if query.trim()}
							<li>
								<a
									href="/catalog?q={encodeURIComponent(query.trim())}"
									class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
								>
									<SearchIcon class="size-4 text-muted-foreground" />
									Шукати «{query.trim()}»
								</a>
							</li>
						{/if}
					</ul>
				</div>
			</div>
		</div>
	</div>
{/if}
