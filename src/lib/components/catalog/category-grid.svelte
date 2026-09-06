<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import type { CategoryCard } from '$lib/types';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	let { categories }: { categories: CategoryCard[] } = $props();

	/** Плитки з'являються хвилею по ряду — так само, як картки товарів. */
	const STAGGER_MS = 70;
</script>

<ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
	{#each categories as category, index (category.slug)}
		<li>
			<a
				href="/catalog/{category.slug}"
				class="group block"
				use:reveal={{ delay: (index % 3) * STAGGER_MS }}
			>
				<!-- Фото на всю плитку: назву на самому знімку робить фотограф,
			     у розмітці лишається тільки підпис під карткою. -->
				<div class="aspect-square overflow-hidden rounded-xl bg-muted">
					{#if category.imageUrl}
						<!-- alt порожній свідомо: назва категорії поруч, у підписі. -->
						<img
							src={category.imageUrl}
							alt=""
							loading={index < 3 ? 'eager' : 'lazy'}
							class="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none"
						/>
					{/if}
				</div>

				<p class="mt-3 flex items-center justify-center gap-2 text-sm font-medium">
					{category.name}
					<ArrowRightIcon
						class="size-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
						aria-hidden="true"
					/>
				</p>
			</a>
		</li>
	{/each}
</ul>
