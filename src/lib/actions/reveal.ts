import type { Action } from 'svelte/action';

/**
 * Плавна поява блоку при скролі.
 *
 * Спостерігач спрацьовує один раз і одразу відключається — це дешевше
 * за scroll-листенер і не смикає layout.
 *
 * Те, що видно вже при завантаженні, не анімується взагалі. Сервер віддає
 * сторінку видимою, і якби тут одразу вішався клас `.reveal` (opacity: 0),
 * перший екран спершу зникав би, а потім проявлявся заново. Крім миготіння,
 * це коштувало швидкості: Google рахує найбільший елемент сторінки (LCP)
 * з моменту, коли його стало видно, а прозорий він до гідратації і ще
 * секунду переходу. Тому ховаємо лише те, що лежить нижче екрана, —
 * там цього ніхто не побачить.
 *
 * Використання: `<section use:reveal>` або `<div use:reveal={{ delay: 120 }}>`
 */
export const reveal: Action<HTMLElement, { delay?: number } | undefined> = (node, options) => {
	// Без JS або з вимкненою анімацією контент має лишатись видимим,
	// тому клас .reveal (opacity: 0) навішується лише тут, у браузері.
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reducedMotion) return;

	let hidden = false;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!hidden) {
					// Перший виклик приходить одразу після підписки й каже, де
					// блок зараз. Координати беремо з самого запису — окремий
					// getBoundingClientRect змусив би браузер перерахувати макет.
					if (entry.boundingClientRect.top < window.innerHeight) {
						observer.disconnect();
						return;
					}

					hidden = true;
					node.classList.add('reveal');
					if (options?.delay) node.style.setProperty('--reveal-delay', `${options.delay}ms`);
					continue;
				}

				if (!entry.isIntersecting) continue;
				node.classList.add('reveal-visible');
				observer.disconnect();
			}
		},
		// Блок має встигнути зайти в кадр: нижній край екрана «піднятий»
		// на 18%, і потрібно, щоб було видно хоча б восьму частину блоку.
		// Інакше поява спрацьовує ще за краєм і читається як миготіння.
		{ rootMargin: '0px 0px -18% 0px', threshold: 0.12 }
	);

	observer.observe(node);

	return {
		destroy: () => observer.disconnect()
	};
};
