<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	/** Каркас чекауту: повторює реальну сітку, щоб контент не стрибав. */
</script>

<div class="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]" aria-busy="true" aria-live="polite">
	<div class="space-y-10">
		{#each { length: 2 }, section (section)}
			<section class="space-y-4">
				<Skeleton class="h-6 w-44 rounded-lg" />
				<div class="grid gap-4 sm:grid-cols-2">
					{#each { length: 2 }, field (field)}
						<div class="space-y-2">
							<Skeleton class="h-3.5 w-28 rounded-md" />
							<Skeleton class="h-10 w-full rounded-xl" />
						</div>
					{/each}
				</div>
				<div class="space-y-2">
					<Skeleton class="h-3.5 w-24 rounded-md" />
					<Skeleton class="h-10 w-full rounded-xl" />
				</div>
			</section>
		{/each}

		<section class="space-y-4">
			<Skeleton class="h-6 w-28 rounded-lg" />
			<Skeleton class="h-28 w-full rounded-xl" />
		</section>
	</div>

	<aside>
		<div class="space-y-4 rounded-2xl border p-6">
			<Skeleton class="h-5 w-36 rounded-md" />

			{#each { length: 3 }, line (line)}
				<div class="flex justify-between gap-3">
					<div class="flex-1 space-y-1.5">
						<Skeleton class="h-3.5 w-3/4 rounded-md" />
						<Skeleton class="h-2.5 w-1/2 rounded-md" />
					</div>
					<Skeleton class="h-3.5 w-16 rounded-md" />
				</div>
			{/each}

			<div class="space-y-2 border-t pt-4">
				<Skeleton class="h-3.5 w-full rounded-md" />
				<Skeleton class="h-3.5 w-2/3 rounded-md" />
			</div>

			<Skeleton class="h-11 w-full rounded-xl" />
		</div>
	</aside>
</div>
