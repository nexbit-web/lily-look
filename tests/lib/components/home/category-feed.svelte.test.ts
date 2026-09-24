import type { HomeSection } from '$lib/types';
import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CategoryFeed from '$lib/components/home/category-feed.svelte';

/**
 * Стрічки категорій додаються по мірі прокрутки.
 *
 * Сенс перевірки — у висоті сторінки: одразу в ній рівно те, що віддав
 * сервер, тож смуга прокрутки не показує повну висоту каталогу ще до
 * того, як завантажилось хоч одне фото.
 */

const section = (slug: string, withProducts = false): HomeSection => ({
	slug,
	name: slug,
	productCount: 2,
	products: withProducts
		? [
				{
					id: `${slug}-1`,
					slug: `${slug}-1`,
					name: `Річ ${slug}`,
					price: 100_000,
					compareAt: null,
					image: null,
					hoverImage: null,
					colors: [],
					inStock: true
				}
			]
		: null
});

/** Керований IntersectionObserver: тест сам вирішує, коли догортали до кінця. */
const observers: TestObserver[] = [];

class TestObserver {
	live = true;

	constructor(readonly callback: IntersectionObserverCallback) {
		observers.push(this);
	}
	observe() {}
	unobserve() {}
	// Відключений спостерігач більше не спрацьовує — інакше тест побачив би
	// не один крок, а лавину зі старих міток.
	disconnect() {
		this.live = false;
	}
	takeRecords() {
		return [];
	}
}

/**
 * Догортали до мітки кінця списку.
 *
 * Запис — як у справжньому браузері: у кожного є координати. Поява блоків
 * (`reveal`) дивиться саме на них, щоб не гасити те, що вже на екрані.
 */
function scrollToEnd() {
	const entry = {
		isIntersecting: true,
		boundingClientRect: { top: 0 } as DOMRectReadOnly
	} as IntersectionObserverEntry;
	for (const observer of [...observers]) {
		if (observer.live) observer.callback([entry], null as unknown as IntersectionObserver);
	}
}

const headings = () =>
	screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent?.trim());

beforeEach(() => {
	observers.length = 0;
	vi.stubGlobal('IntersectionObserver', TestObserver);
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('стрічка категорій', () => {
	const sections = [
		section('sukni', true),
		section('kostiumy'),
		section('palto'),
		section('zhakety')
	];

	it('одразу показує тільки те, що приїхало з сервером', () => {
		render(CategoryFeed, { sections, initial: 1 });

		expect(headings()).toEqual(['sukni']);
	});

	it('догортали до кінця — додається наступна стрічка', async () => {
		render(CategoryFeed, { sections, initial: 1 });

		scrollToEnd();
		await Promise.resolve();

		expect(headings()).toEqual(['sukni', 'kostiumy']);
	});

	it('гортаємо далі — зрештою показані всі стрічки', async () => {
		render(CategoryFeed, { sections, initial: 1 });

		for (let step = 0; step < 5; step += 1) {
			scrollToEnd();
			await Promise.resolve();
		}

		expect(headings()).toEqual(['sukni', 'kostiumy', 'palto', 'zhakety']);
	});
});
