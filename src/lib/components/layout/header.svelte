<script lang="ts">
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { SITE } from '$lib/config';
	import type { CategoryLink } from '$lib/types';
	import HandbagIcon from '@lucide/svelte/icons/handbag';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import SearchIcon from '@lucide/svelte/icons/search';
	import type { Component } from 'svelte';

	let { categories, cartCount }: { categories: CategoryLink[]; cartCount: number } = $props();

	let mobileOpen = $state(false);
	let searchOpen = $state(false);

	/**
	 * Меню й пошук важать більше, ніж уся решта шапки, а потрібні лише після
	 * кліку. Тому компоненти підвантажуються в момент першого відкриття:
	 * перший екран не платить за них ні байтом.
	 */
	let MobileMenu = $state<Component<{ open?: boolean; categories: CategoryLink[] }> | null>(null);
	let SearchOverlay = $state<Component<{
		open?: boolean;
		categories: CategoryLink[];
	}> | null>(null);

	async function openMenu() {
		MobileMenu ??= (await import('$lib/components/layout/mobile-menu.svelte')).default;
		mobileOpen = true;
	}

	async function openSearch() {
		SearchOverlay ??= (await import('$lib/components/layout/search-overlay.svelte')).default;
		searchOpen = true;
	}

	function isActive(slug: string) {
		return page.url.pathname === `/catalog/${slug}`;
	}
</script>

<header class="sticky top-0 z-40 bg-background/85 backdrop-blur-md">
	<div class="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
		<Button variant="ghost" size="icon" class="md:hidden" aria-label="Меню" onclick={openMenu}>
			<MenuIcon />
		</Button>

		<a href="/" class="font-heading text-xl tracking-[0.2em] uppercase">
			{SITE.name}
		</a>

		<nav class="ml-6 hidden items-center gap-5 md:flex">
			{#each categories.slice(0, 5) as category (category.slug)}
				<a
					href="/catalog/{category.slug}"
					class="text-sm transition-colors hover:text-foreground {isActive(category.slug)
						? 'font-medium text-foreground'
						: 'text-muted-foreground'}"
				>
					{category.name}
				</a>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-1">
			<!--
				Розмір іконок задається класом size-* саме на іконці.
				У кнопці з ui/ прописано `[&_svg:not([class*='size-'])]:size-3.5`,
				тож без такого класу (і з атрибутом size={…}) вона примусово
				стискає будь-яку іконку до 14px.
			-->
			<Button variant="ghost" size="icon" aria-label="Пошук" onclick={openSearch}>
				<SearchIcon class="size-3" />
			</Button>

			<Button href="/cart" variant="ghost" size="icon" class="relative" aria-label="Кошик">
				<HandbagIcon class="size-3" />
				{#if cartCount > 0}
					<Badge
						class="absolute -top-0.5 -right-0.5 size-4 justify-center rounded-full bg-brand p-0 text-[10px] text-brand-foreground tabular-nums"
					>
						{cartCount}
					</Badge>
				{/if}
			</Button>
		</div>
	</div>
</header>

{#if MobileMenu}
	<MobileMenu bind:open={mobileOpen} {categories} />
{/if}

{#if SearchOverlay}
	<SearchOverlay bind:open={searchOpen} {categories} />
{/if}
