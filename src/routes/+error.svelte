<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { SITE } from '$lib/config';

	/**
	 * Що сказати покупцеві.
	 *
	 * 404 приходить із нашим власним текстом («Такого товару не існує»), його
	 * й показуємо. А от на збої сервера SvelteKit підставляє англійське
	 * «Internal Error» — покупцеві воно нічого не пояснює, тож для 5xx текст
	 * свій.
	 */
	const missing = $derived(page.status === 404);
	const heading = $derived(missing ? 'Сторінку не знайдено' : 'Щось пішло не так');
	const message = $derived(
		missing
			? (page.error?.message ?? 'Такої сторінки немає або її вже прибрали.')
			: 'Ми вже бачимо помилку. Спробуйте оновити сторінку за хвилину.'
	);
</script>

<!-- Сторінка помилки не має потрапити у видачу замість справжньої. -->
<svelte:head>
	<title>{heading} — {SITE.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-md px-4 py-32 text-center">
	<p class="font-heading text-6xl" aria-hidden="true">{page.status}</p>
	<h1 class="mt-4 font-heading text-2xl">{heading}</h1>
	<p class="mt-3 text-muted-foreground">{message}</p>

	<!-- Товар могли розпродати, а посилання лишилось у закладках чи в
	     пошуку. Каталог — найкоротший шлях до схожої речі. -->
	<div class="mt-8 flex justify-center gap-3">
		<Button href="/catalog">До каталогу</Button>
		<Button href="/" variant="outline">На головну</Button>
	</div>
</div>
