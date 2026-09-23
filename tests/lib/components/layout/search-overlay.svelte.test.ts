import type { CategoryLink, ProductCard } from '$lib/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SearchOverlay from '$lib/components/layout/search-overlay.svelte';

/**
 * Пошук перевіряємо з двох боків.
 *
 * Перший — витрати: запит іде тільки коли справді набрали, не раніше, ніж
 * пальці зупинились, і не вдруге за тим самим словом. Другий — вихід:
 * панель має закриватись усіма зрозумілими способами, бо на телефоні
 * «тапніть мимо» здогадується не кожен.
 */

const goto = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => goto(...args),
	preloadData: vi.fn()
}));

const state = { url: new URL('https://lilylook.test/') };
vi.mock('$app/state', () => ({
	get page() {
		return state;
	}
}));

const categories: CategoryLink[] = [
	{ slug: 'sukni', name: 'Сукні', productCount: 4 },
	{ slug: 'palto', name: 'Пальто', productCount: 2 }
];

const card = (patch: Partial<ProductCard> = {}): ProductCard => ({
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сатинова сукня Olivia',
	price: 219_900,
	compareAt: null,
	image: null,
	hoverImage: null,
	colors: ['Чорний'],
	inStock: true,
	...patch
});

const fetchMock = vi.fn();

/** Відповідь пошуку. */
const answer = (items: ProductCard[], total = items.length) => ({
	ok: true,
	json: async () => ({ items, total })
});

const open = () => render(SearchOverlay, { open: true, categories });
const field = () => screen.getByRole('combobox', { name: 'Пошук товарів' });
const type = async (value: string) => fireEvent.input(field(), { target: { value } });

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	fetchMock.mockReset();
	fetchMock.mockResolvedValue(answer([card()]));
	vi.stubGlobal('fetch', fetchMock);
	localStorage.clear();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('коли пошук звертається до сервера', () => {
	it('сам собою — жодного запиту', () => {
		open();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('на одну літеру — теж жодного: вона знайшла б пів каталогу', async () => {
		open();
		await type('с');
		await vi.advanceTimersByTimeAsync(500);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('поки друкують, летить лише останній запит', async () => {
		open();
		await type('су');
		await type('сук');
		await type('сукн');
		await vi.advanceTimersByTimeAsync(500);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('/api/search?q=%D1%81%D1%83%D0%BA%D0%BD');
	});

	it('за тим самим словом удруге в мережу не ходить', async () => {
		open();
		await type('сукня');
		await vi.advanceTimersByTimeAsync(500);
		await type('сукн');
		await vi.advanceTimersByTimeAsync(500);
		await type('сукня');
		await vi.advanceTimersByTimeAsync(500);

		// «сукня» і «сукн» — два різні запити, повтор «сукня» — з пам'яті.
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe('видача', () => {
	it('показує знайдені товари з ціною', async () => {
		open();
		await type('сукня');
		await vi.advanceTimersByTimeAsync(500);

		const option = await screen.findByRole('option', { name: /Сатинова сукня Olivia/ });
		expect(option).toHaveAttribute('href', '/product/suknia-olivia');
		expect(option.textContent?.replace(/\s/g, ' ')).toContain('2 199 грн');
	});

	it('веде на сторінку результатів і каже, скільки всього знайшлось', async () => {
		fetchMock.mockResolvedValue(answer([card()], 12));
		open();
		await type('сукня');
		await vi.advanceTimersByTimeAsync(500);

		const all = await screen.findByRole('option', { name: /Показати всі 12 результатів/ });
		expect(all).toHaveAttribute('href', '/catalog?q=%D1%81%D1%83%D0%BA%D0%BD%D1%8F');
	});

	it('нічого не знайшли — так і кажемо', async () => {
		fetchMock.mockResolvedValue(answer([]));
		open();
		await type('абракадабра');
		await vi.advanceTimersByTimeAsync(500);

		expect(await screen.findByText(/Нічого не знайшли/)).toBeInTheDocument();
	});

	it('сервер не відповів — лишається дорога в каталог', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 500 });
		open();
		await type('сукня');
		await vi.advanceTimersByTimeAsync(500);

		const link = await screen.findByRole('link', { name: /Спробувати на сторінці каталогу/ });
		expect(link).toHaveAttribute('href', '/catalog?q=%D1%81%D1%83%D0%BA%D0%BD%D1%8F');
	});

	it('порожній рядок — категорії під рукою, а не порожнеча', () => {
		open();

		expect(screen.getByRole('link', { name: 'Сукні' })).toHaveAttribute('href', '/catalog/sukni');
		expect(screen.getByRole('link', { name: 'Знижки' })).toBeInTheDocument();
	});
});

describe('клавіатура', () => {
	it('Enter веде на сторінку результатів', async () => {
		open();
		await type('сукня');
		await vi.advanceTimersByTimeAsync(500);
		await fireEvent.submit(field().closest('form')!);

		expect(goto).toHaveBeenCalledWith('/catalog?q=%D1%81%D1%83%D0%BA%D0%BD%D1%8F');
	});

	it('стрілка вниз обирає товар, Enter відкриває саме його', async () => {
		open();
		await type('сукня');
		await vi.advanceTimersByTimeAsync(500);
		await screen.findByRole('option', { name: /Olivia/ });

		await fireEvent.keyDown(window, { key: 'ArrowDown' });
		await fireEvent.submit(field().closest('form')!);

		expect(goto).toHaveBeenCalledWith('/product/suknia-olivia');
	});
});

describe('як закрити', () => {
	it('кнопкою «закрити»', async () => {
		open();
		await fireEvent.click(screen.getAllByRole('button', { name: 'Закрити пошук' })[1]);

		await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
	});

	it('клавішею Escape', async () => {
		open();
		await fireEvent.keyDown(window, { key: 'Escape' });

		await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
	});

	it('кліком повз панель', async () => {
		open();
		await fireEvent.click(screen.getAllByRole('button', { name: 'Закрити пошук' })[0]);

		await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
	});

	it('коли фокус пішов зі сторінки пошуку геть', async () => {
		open();
		const outside = document.createElement('button');
		document.body.append(outside);

		await fireEvent.focusOut(field(), { relatedTarget: outside });

		await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
	});

	it('але не тоді, коли фокус лишився всередині панелі', async () => {
		open();
		await type('сукня');
		const close = screen.getAllByRole('button', { name: 'Закрити пошук' })[1];

		await fireEvent.focusOut(field(), { relatedTarget: close });

		expect(screen.queryByRole('combobox')).toBeInTheDocument();
	});
});

describe('історія запитів', () => {
	it('після пошуку слово лишається під рукою', async () => {
		localStorage.setItem('lily_recent_searches', JSON.stringify(['пальто']));
		open();

		const again = screen.getByRole('button', { name: /пальто/ });
		await fireEvent.click(again);

		expect((field() as HTMLInputElement).value).toBe('пальто');
	});

	it('зіпсоване сховище не ламає пошук', () => {
		localStorage.setItem('lily_recent_searches', 'це не JSON');
		open();

		expect(field()).toBeInTheDocument();
	});
});
