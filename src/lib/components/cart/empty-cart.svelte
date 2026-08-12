<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import HandbagIcon from '@lucide/svelte/icons/handbag';

	/**
	 * Порожній кошик займає перший екран цілком (100svh мінус шапка h-16).
	 * Іконка та сама, що в шапці, — щоб було зрозуміло, про що мова.
	 */
</script>

<div class="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center px-4 text-center">
	<HandbagIcon class="size-10 text-muted-foreground" strokeWidth={1.25} />

	<h1 class="mt-8 font-heading text-4xl sm:text-5xl">Кошик порожній</h1>

	<p class="mt-4 max-w-xs text-sm text-muted-foreground">
		Саме час обрати щось для себе — речі чекатимуть тут 30 днів.
	</p>

	<Button href="/catalog" size="lg" class="mt-9">До каталогу</Button>

	<a
		href="/catalog?sale=1"
		class="mt-5 text-xs tracking-[0.15em] text-muted-foreground uppercase transition-colors hover:text-foreground"
	>
		Знижки
	</a>
</div>
