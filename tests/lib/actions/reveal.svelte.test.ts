import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reveal } from '$lib/actions/reveal';

/**
 * Поява блоків при скролі.
 *
 * Головне тут не сама анімація, а те, чого вона не має робити: гасити
 * перший екран. Сервер віддає сторінку видимою, і якщо скрипт після
 * гідратації робить її прозорою, покупець бачить миготіння, а Google
 * рахує найбільший елемент сторінки (LCP) на секунду пізніше.
 */

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let observers: { callback: Callback; disconnected: boolean }[] = [];

beforeEach(() => {
	observers = [];
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			record = { callback: (() => {}) as Callback, disconnected: false };
			constructor(callback: Callback) {
				this.record.callback = callback;
				observers.push(this.record);
			}
			observe() {}
			disconnect() {
				this.record.disconnected = true;
			}
		}
	);
	vi.stubGlobal('innerHeight', 800);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Що каже спостерігач: де блок і чи він у кадрі. */
function report(top: number, isIntersecting: boolean) {
	observers[0].callback([{ boundingClientRect: { top } as DOMRectReadOnly, isIntersecting }]);
}

describe('поява при скролі', () => {
	it('блок на першому екрані не ховається ні на мить', () => {
		const node = document.createElement('section');
		reveal(node, undefined);

		// До першої відповіді спостерігача клас не навішується — інакше
		// видимий блок зник би ще до того, як стане відомо, де він.
		expect(node.classList.contains('reveal')).toBe(false);

		report(120, true);

		expect(node.classList.contains('reveal')).toBe(false);
		expect(observers[0].disconnected).toBe(true);
	});

	/**
	 * Нижній край екрана спостерігач «піднімає» на 18 %, тож блок, що лише
	 * визирає знизу, для нього ще не в кадрі. Але людина його вже бачить —
	 * ховати його не можна.
	 */
	it('блок, що визирає з-під краю екрана, теж лишається як є', () => {
		const node = document.createElement('section');
		reveal(node, undefined);

		report(760, false);

		expect(node.classList.contains('reveal')).toBe(false);
	});

	it('блок нижче екрана ховається й проявляється, коли до нього догортають', () => {
		const node = document.createElement('section');
		reveal(node, { delay: 140 });

		report(1600, false);
		expect(node.classList.contains('reveal')).toBe(true);
		expect(node.style.getPropertyValue('--reveal-delay')).toBe('140ms');

		report(500, true);
		expect(node.classList.contains('reveal-visible')).toBe(true);
		expect(observers[0].disconnected).toBe(true);
	});

	it('з вимкненими в системі анімаціями нічого не ховається взагалі', () => {
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: query.includes('reduce'),
			media: query
		}));
		const node = document.createElement('section');

		reveal(node, undefined);

		expect(observers).toHaveLength(0);
		expect(node.classList.contains('reveal')).toBe(false);
	});
});
