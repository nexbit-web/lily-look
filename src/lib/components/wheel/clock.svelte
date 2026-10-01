<script lang="ts">
	import { formatCountdown } from '$lib/wheel';

	/**
	 * Цифри таймера приза: «23:59:07».
	 *
	 * Час рахується лише в браузері (сервер віддає сторінку без нього —
	 * інакше після гідратації секунди розійшлися б). Поки браузер ще не
	 * порахував, на місці цифр — скелетон рівно їхньої ширини: невидимі
	 * «00:00:00» тримають місце, тож нічого не зсувається, коли час
	 * з'являється.
	 */
	let { left }: { left: number | null } = $props();
</script>

{#if left === null}
	<span data-slot="clock-skeleton" class="relative inline-block tabular-nums" aria-hidden="true">
		<span class="invisible">00:00:00</span>
		<span class="absolute inset-x-0 inset-y-[0.1em] animate-pulse rounded bg-current opacity-25"
		></span>
	</span>
{:else}
	<span class="tabular-nums">{formatCountdown(left)}</span>
{/if}
