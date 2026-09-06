<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { SITE } from '$lib/config';
	import type { CategoryLink } from '$lib/types';

	let { open = $bindable(false), categories }: { open?: boolean; categories: CategoryLink[] } =
		$props();
</script>

<!--
	Меню винесене в окремий компонент, щоб шапка вантажила його (а разом із ним
	і діалог із bits-ui) лише після першого дотику до кнопки. На головній це
	просто мертвий код у критичному шляху.
-->
<Sheet.Root bind:open>
	<Sheet.Content side="left" class="w-72">
		<Sheet.Header>
			<Sheet.Title class="font-heading text-xl">{SITE.name}</Sheet.Title>
		</Sheet.Header>
		<nav class="grid gap-1 px-4">
			<a
				href="/catalog"
				class="rounded-xl px-3 py-2 text-sm hover:bg-accent"
				onclick={() => (open = false)}
			>
				Усі категорії
			</a>
			{#each categories as category (category.slug)}
				<a
					href="/catalog/{category.slug}"
					class="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-accent"
					onclick={() => (open = false)}
				>
					{category.name}
					<span class="text-xs text-muted-foreground">{category.productCount}</span>
				</a>
			{/each}
		</nav>
	</Sheet.Content>
</Sheet.Root>
