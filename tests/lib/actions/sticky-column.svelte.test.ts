import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stickyColumn } from '$lib/actions/sticky-column';

/**
 * Липка колонка сторінки товару. Перевіряємо саме `top`: від нього
 * залежить, чи побачить покупець останній рядок колонки («Повернення
 * протягом 14 днів»), перш ніж сторінка поїде далі.
 */

let resized: (() => void)[] = [];
let disconnected = 0;

beforeEach(() => {
	resized = [];
	disconnected = 0;
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(callback: () => void) {
				resized.push(callback);
			}
			observe() {}
			disconnect() {
				disconnected++;
			}
		}
	);
	// Кадр анімації — одразу, щоб не чекати браузера.
	vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => (run(0), 1));
	vi.stubGlobal('cancelAnimationFrame', () => {});
	vi.stubGlobal('innerHeight', 900);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Колонка заданої висоти: jsdom сам висоту не рахує. */
function column(height: number) {
	const node = document.createElement('div');
	Object.defineProperty(node, 'offsetHeight', { configurable: true, get: () => height });
	return node;
}

describe('липка колонка', () => {
	it('влазить в екран — липне під шапкою', () => {
		const node = column(500);
		stickyColumn(node);

		expect(node.style.top).toBe('80px');
	});

	it('довша за екран — зупиняється низом біля краю екрана', () => {
		// Місця 900 − 80 − 24 = 796; колонка 1200 — вилазить на 404.
		const node = column(1200);
		stickyColumn(node);

		expect(node.style.top).toBe(`${80 - 404}px`);
	});

	it('колонка виросла — top перераховано', () => {
		let height = 500;
		const node = document.createElement('div');
		Object.defineProperty(node, 'offsetHeight', { get: () => height });
		stickyColumn(node);
		expect(node.style.top).toBe('80px');

		height = 1000;
		resized[0]();

		expect(node.style.top).toBe(`${80 - 204}px`);
	});

	it('вікно змінило висоту — top перераховано', () => {
		const node = column(1000);
		stickyColumn(node);

		vi.stubGlobal('innerHeight', 1200);
		window.dispatchEvent(new Event('resize'));

		expect(node.style.top).toBe('80px');
	});

	it('після знищення нічого не слухає', () => {
		const node = column(1000);
		const action = stickyColumn(node);
		action?.destroy?.();

		expect(disconnected).toBe(1);
		vi.stubGlobal('innerHeight', 400);
		node.style.top = '1px';
		window.dispatchEvent(new Event('resize'));
		expect(node.style.top).toBe('1px');
	});
});
