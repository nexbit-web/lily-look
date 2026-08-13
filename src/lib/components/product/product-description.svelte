<script lang="ts">
	/**
	 * Опис під кнопкою. Довгий текст не розтягує сторінку: блок прокручується
	 * усередині себе, а коли текст закінчився — прокрутка природно переходить
	 * на сторінку. Смуга прокрутки прихована, тож замість неї внизу тане
	 * градієнт — підказка, що там є ще текст.
	 */

	let { text }: { text: string } = $props();

	let box = $state<HTMLElement | null>(null);
	let content = $state<HTMLElement | null>(null);
	let scrollable = $state(false);
	let atEnd = $state(false);

	function measure() {
		if (!box) return;
		scrollable = box.scrollHeight - box.clientHeight > 1;
		atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
	}

	// Стежимо за висотою самого тексту: вона змінюється не лише від нового
	// товару, а й коли підвантажився шрифт або звузилось вікно.
	$effect(() => {
		if (!content) return;

		const observer = new ResizeObserver(measure);
		observer.observe(content);
		measure();

		return () => observer.disconnect();
	});
</script>

<section class="space-y-4">
	<h2 class="text-xs tracking-[0.15em] uppercase">Опис</h2>

	<div class="relative">
		<div
			bind:this={box}
			onscroll={measure}
			class="no-scrollbar max-h-64 overflow-y-auto leading-relaxed whitespace-pre-line text-muted-foreground"
		>
			<div bind:this={content}>{text}</div>
		</div>

		{#if scrollable && !atEnd}
			<div
				class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background to-transparent"
			></div>
		{/if}
	</div>
</section>
