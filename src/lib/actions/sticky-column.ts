import type { Action } from 'svelte/action';

/**
 * Колонка, що липне так, щоб її було видно до кінця, — як на сторінках
 * товару Temu й Amazon.
 *
 * Гортає сторінка сама браузер — плавно, з інерцією тачпада, без жодного
 * перехоплення колеса. Колонка лише отримує правильний `top` для
 * `position: sticky`:
 *  — влазить в екран — липне під шапкою, як звичайна sticky-панель;
 *  — довша за екран — їде разом зі сторінкою, доки не покаже свій низ, і
 *    тоді зупиняється біля нижнього краю екрана. Довша сусідня колонка
 *    гортається далі.
 *
 * Тобто спершу покупець бачить усю коротшу колонку до останнього рядка
 * («Повернення протягом 14 днів»), і лише потім сторінка йде далі.
 *
 * `top` перераховується, лише коли змінюється висота колонки чи вікна
 * (ResizeObserver), а не на кожен кадр прокрутки — гортання нічого не
 * коштує. Саме `position: sticky` вмикає розмітка (`lg:sticky`): на
 * телефоні колонок немає, і там `top` ні на що не впливає.
 */

/** Відступ під шапкою (5rem) і від нижнього краю екрана. */
const HEADER = 80;
const BOTTOM_GAP = 24;

export const stickyColumn: Action<HTMLElement> = (node) => {
	let frame = 0;

	function place() {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			const room = window.innerHeight - HEADER - BOTTOM_GAP;
			const overflow = node.offsetHeight - room;
			// Не влазить — зсуваємо вгору рівно на стільки, щоб низ колонки
			// стояв над нижнім краєм екрана.
			node.style.top = `${overflow > 0 ? HEADER - overflow : HEADER}px`;
		});
	}

	const observer = new ResizeObserver(place);
	observer.observe(node);
	window.addEventListener('resize', place);
	place();

	return {
		destroy() {
			cancelAnimationFrame(frame);
			observer.disconnect();
			window.removeEventListener('resize', place);
		}
	};
};
