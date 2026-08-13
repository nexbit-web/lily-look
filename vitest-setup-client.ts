import '@testing-library/jest-dom/vitest';

/**
 * jsdom не має верстки, тож частина браузерних API просто відсутня.
 * Додаємо мінімум, потрібний компонентам магазину.
 */

Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string) => ({
		matches: false,
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

Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};
