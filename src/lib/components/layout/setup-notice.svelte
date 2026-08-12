<script lang="ts">
	/**
	 * Показується замість контенту, поки не заданий DATABASE_URL.
	 * Краще коротка інструкція, ніж стектрейс Prisma на весь екран.
	 */
	const steps = [
		{
			title: 'Створи базу в Neon',
			body: 'console.neon.tech → New project → регіон EU (Frankfurt). Скопіюй два рядки підключення: pooled і direct.'
		},
		{
			title: 'Заповни .env',
			body: 'DATABASE_URL = pooled (у хості є «-pooler»), DIRECT_URL = direct.'
		},
		{
			title: 'Накоти схему й дані',
			body: 'npm run db:migrate — створить таблиці, npm run db:seed — заллє демо-каталог.'
		}
	];
</script>

<div class="mx-auto max-w-2xl px-4 py-24">
	<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">Налаштування</p>
	<h1 class="mt-3 font-heading text-3xl">База даних ще не підключена</h1>
	<p class="mt-3 text-sm text-muted-foreground">Три кроки — і магазин запрацює з демо-каталогом.</p>

	<ol class="mt-10 space-y-6">
		{#each steps as step, index (step.title)}
			<li class="flex gap-4">
				<span
					class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground tabular-nums"
				>
					{index + 1}
				</span>
				<div>
					<p class="font-medium">{step.title}</p>
					<p class="mt-1 text-sm text-muted-foreground">{step.body}</p>
				</div>
			</li>
		{/each}
	</ol>
</div>
