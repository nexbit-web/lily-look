import type { Action } from 'svelte/action';

/**
 * Плавна поява блоку при скролі.
 *
 * Спостерігач спрацьовує один раз і одразу відключається — це дешевше
 * за scroll-листенер і не смикає layout. Елементи, які вже видно при
 * завантаженні, показуються без затримки.
 *
 * Використання: `<section use:reveal>` або `<div use:reveal={{ delay: 120 }}>`
 */
export const reveal: Action<HTMLElement, { delay?: number } | undefined> = (node, options) => {
	// Без JS або з вимкненою анімацією контент має лишатись видимим,
	// тому клас .reveal (opacity: 0) навішується лише тут, у браузері.
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reducedMotion) return;

	node.classList.add('reveal');
	if (options?.delay) node.style.setProperty('--reveal-delay', `${options.delay}ms`);

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				node.classList.add('reveal-visible');
				observer.disconnect();
			}
		},
		// Запускаємо трохи раніше, ніж блок торкнеться краю екрана.
		{ rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
	);

	observer.observe(node);

	return {
		destroy: () => observer.disconnect()
	};
};
