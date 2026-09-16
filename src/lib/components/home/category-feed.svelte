<script lang="ts">
	import CategorySection from '$lib/components/home/category-section.svelte';
	import type { HomeSection } from '$lib/types';

	/**
	 * Стрічки категорій — увесь асортимент полицями.
	 *
	 * Сторінка не має вдавати, ніби вона вже вся тут: спочатку в ній рівно
	 * стільки стрічок, скільки віддав сервер, і смуга прокрутки показує
	 * саме цю висоту. Наступна стрічка додається, коли покупець догортав до
	 * кінця попередньої, — сторінка росте разом із ним, а не стрибає на
	 * повну висоту ще до того, як хоч одне фото завантажилось.
	 */
	let { sections, initial }: { sections: HomeSection[]; initial: number } = $props();

	/**
	 * За скільки до кінця списку додаємо наступну стрічку. Запас великий
	 * навмисно: стрічка має стати на місце, поки кінець сторінки ще далеко
	 * за кадром. Інакше при швидкій прокрутці нижній блок встигає з'явитись
	 * на екрані — і наступна стрічка виштовхує його з-під очей.
	 */
	const PRELOAD_MARGIN = '1400px 0px';

	/** Скільки стрічок додали понад ті, що приїхали з сервером. */
	let added = $state(0);
	let sentinel = $state<HTMLElement>();

	const shown = $derived(Math.min(initial + added, sections.length));
	const visible = $derived(sections.slice(0, shown));

	$effect(() => {
		if (!sentinel || shown >= sections.length) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) added += 1;
			},
			{ rootMargin: PRELOAD_MARGIN }
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

{#each visible as section (section.slug)}
	<CategorySection {section} />
{/each}

{#if shown < sections.length}
	<!--
		Мітка кінця списку. `key` перестворює її після кожної доданої стрічки:
		інакше, лишившись у кадрі, вона більше не спрацювала б, і стрічки
		перестали б додаватись.
	-->
	{#key shown}
		<div bind:this={sentinel} aria-hidden="true"></div>
	{/key}
{/if}
