<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	/**
	 * Заглушка сітки товарів.
	 *
	 * Повторює розмітку `product-grid` до пікселя — ті самі колонки, ті самі
	 * пропорції кадру, ті самі рядки під назву й ціну. Завдяки цьому картки
	 * стають на місце заглушки без стрибка сторінки: людина не втрачає те
	 * місце, яке читала.
	 */
	let { count = 4 }: { count?: number } = $props();

	const cells = $derived(Array.from({ length: Math.max(1, count) }, (_, index) => index));
</script>

<div
	class="-mx-2 grid grid-cols-2 gap-x-2 gap-y-8 sm:mx-0 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4"
	aria-hidden="true"
	data-slot="grid-skeleton"
>
	{#each cells as cell (cell)}
		<div>
			<Skeleton class="aspect-3/4 w-full rounded-sm sm:aspect-4/5" />
			<div class="mt-3 space-y-2">
				<Skeleton class="h-3.5 w-3/4 rounded-sm" />
				<Skeleton class="h-3.5 w-1/3 rounded-sm" />
			</div>
		</div>
	{/each}
</div>
