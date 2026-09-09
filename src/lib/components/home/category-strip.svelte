<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import type { CategoryCard } from '$lib/types';

	let { categories }: { categories: CategoryCard[] } = $props();
</script>

<!--
	Перше, що покупець робить на головній, — обирає тип речі. Тому смуга
	категорій стоїть одразу під банером: коротка дорога до потрібної полиці.
	На телефоні гортається вбік, щоб не з'їдати екран висотою.
-->
<!--
	Поля на телефоні лежать на самому списку, і йому потрібен `w-max`:
	без нього список завширшки з екран, картки вилазять за його межі, і
	праве поле опиняється лівіше за останню картку — вона впирається
	в край екрана.
-->
<div class="-mx-4 no-scrollbar overflow-x-auto sm:mx-0 sm:overflow-visible">
	<ul class="flex w-max gap-4 px-4 sm:grid sm:w-auto sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
		{#each categories as category, index (category.slug)}
			<li class="w-32 shrink-0 sm:w-auto">
				<a
					href="/catalog/{category.slug}"
					class="group block"
					use:reveal={{ delay: (index % 6) * 60 }}
				>
					<div class="aspect-square overflow-hidden rounded-full bg-muted sm:rounded-2xl">
						{#if category.imageUrl}
							<img
								src={category.imageUrl}
								alt=""
								loading="lazy"
								class="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none"
							/>
						{/if}
					</div>
					<p class="mt-3 text-center text-sm transition-colors group-hover:text-muted-foreground">
						{category.name}
					</p>
				</a>
			</li>
		{/each}
	</ul>
</div>
