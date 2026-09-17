import '@testing-library/jest-dom/vitest';

/**
 * jsdom не має верстки, тож частина браузерних API просто відсутня.
 * Додаємо мінімум, потрібний компонентам магазину.
 */

Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string) => ({
		// За замовчуванням тести живуть у «десктопному» браузері: курсор є,
		// анімації не вимкнені. Хто перевіряє дотиковий екран — підміняє
		// matchMedia у себе в тесті.
		matches: query.includes('hover'),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false
	})
});

// bits-ui (діалоги, поповери) вимірює елементи через ці два API.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

globalThis.IntersectionObserver ??= class {
	readonly root = null;
	readonly rootMargin = '';
	readonly thresholds = [];
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
} as unknown as typeof IntersectionObserver;

/**
 * Переходи Svelte малюються через Web Animations API, якого в jsdom немає.
 * Підробка одразу повідомляє «анімація завершилась» — інакше елемент, що
 * зникає, назавжди лишався б у DOM, і тест не побачив би закриття.
 */
Element.prototype.animate ??= function animate() {
	const animation = {
		currentTime: 0,
		startTime: 0,
		playState: 'finished',
		effect: { updateTiming: () => {} },
		onfinish: null as null | (() => void),
		cancel: () => {},
		finish() {
			animation.onfinish?.();
		},
		pause: () => {},
		play: () => {},
		reverse: () => {},
		addEventListener: () => {},
		removeEventListener: () => {}
	};
	// `onfinish` призначають уже після виклику animate, тож чекаємо мікрозадачу.
	queueMicrotask(() => animation.onfinish?.());
	return animation as unknown as Animation;
};

Element.prototype.getAnimations ??= () => [];

Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};
