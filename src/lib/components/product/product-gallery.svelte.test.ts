import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProductGallery from './product-gallery.svelte';

const images = [
	{ url: 'https://example.test/1.jpg', alt: 'Фото спереду', color: null },
	{ url: 'https://example.test/2.jpg', alt: 'Фото збоку', color: null },
	{ url: 'https://example.test/3.jpg', alt: 'Деталь тканини', color: null }
];

/** Товар, у якого в кожного кольору свої кадри плюс один спільний. */
const byColor = [
	{ url: 'https://example.test/black-1.jpg', alt: 'Чорна спереду', color: 'Чорний' },
	{ url: 'https://example.test/black-2.jpg', alt: 'Чорна збоку', color: 'Чорний' },
	{ url: 'https://example.test/white-1.jpg', alt: 'Біла спереду', color: 'Білий' },
	{ url: 'https://example.test/fabric.jpg', alt: 'Тканина зблизька', color: null }
];

const shownUrls = () =>
	[...document.querySelectorAll('[style*="translate3d"] img')].map((img) =>
		(img as HTMLImageElement).getAttribute('src')
	);

/** Стрічка кадрів: перемикання — це зсув на 100% ширини за кадр. */
function frame(): number {
	const { transform } = (document.querySelector('[style*="translate3d"]') as HTMLElement).style;
	const percent = Number(/calc\((-?\d+)%/.exec(transform)?.[1]);
	// Math.abs — інакше на першому кадрі вийде -0, а це не те саме, що 0.
	return Math.abs(percent) / 100;
}

describe('галерея товару', () => {
	it('тримає всі кадри в стрічці й мініатюру на кожен', () => {
		render(ProductGallery, { images, name: 'Сукня' });

		expect(screen.getAllByRole('img')).toHaveLength(3);
		expect(screen.getAllByRole('button', { name: /^Фото \d$/ })).toHaveLength(3);
		expect(frame()).toBe(0);
	});

	it('мініатюра зсуває стрічку на потрібний кадр', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		await fireEvent.click(screen.getByRole('button', { name: 'Фото 2' }));

		expect(frame()).toBe(1);
		expect(screen.getByRole('button', { name: 'Фото 2' })).toHaveAttribute('aria-current', 'true');
	});

	it('стрілки гортають по колу', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		await fireEvent.click(screen.getByRole('button', { name: 'Попереднє фото' }));
		expect(frame()).toBe(2);

		await fireEvent.click(screen.getByRole('button', { name: 'Наступне фото' }));
		expect(frame()).toBe(0);
	});

	it('на одному фото не малює зайвих кнопок', () => {
		render(ProductGallery, { images: [images[0]], name: 'Сукня' });

		expect(screen.queryByRole('button', { name: 'Наступне фото' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /^Фото \d$/ })).not.toBeInTheDocument();
	});

	it('лайтбокс закритий, поки по фото не клікнули', () => {
		render(ProductGallery, { images, name: 'Сукня' });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('клік по фото відкриває перегляд на весь екран', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		await fireEvent.click(screen.getByRole('button', { name: 'Відкрити фото на весь екран' }));

		expect(await screen.findByRole('dialog')).toBeInTheDocument();
	});

	it('порожня галерея не падає', () => {
		render(ProductGallery, { images: [], name: 'Сукня' });
		expect(screen.getByRole('button', { name: 'Відкрити фото на весь екран' })).toBeInTheDocument();
	});
});

/**
 * Жест по фото на телефоні. Найдорожча помилка тут — не зламане гортання,
 * а зіпсована прокрутка сторінки: палець іде вниз, а фото їде вбік.
 */
describe('свайп по фото', () => {
	const photo = () => screen.getByRole('button', { name: 'Відкрити фото на весь екран' });

	/** Зсув стрічки в пікселях — те, що видно під час перетягування. */
	function shift(): number {
		const { transform } = (document.querySelector('[style*="translate3d"]') as HTMLElement).style;
		return Number(/\+ (-?\d+(?:\.\d+)?)px/.exec(transform)?.[1] ?? 0);
	}

	async function gesture(steps: { x: number; y: number }[], { release = true } = {}) {
		const target = photo();
		await fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
		for (const step of steps) {
			await fireEvent.pointerMove(target, { pointerId: 1, clientX: step.x, clientY: step.y });
		}
		if (release) {
			const last = steps.at(-1) ?? { x: 0, y: 0 };
			await fireEvent.pointerUp(target, { pointerId: 1, clientX: last.x, clientY: last.y });
		}
	}

	it('вертикальний рух не зсуває фото — це прокрутка сторінки', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		// Палець іде вниз із невеликим боковим відхиленням, як воно й буває.
		await gesture([
			{ x: 4, y: 30 },
			{ x: 12, y: 120 }
		]);

		expect(shift()).toBe(0);
		expect(frame()).toBe(0);
	});

	it('горизонтальний рух тягне стрічку за пальцем', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		await gesture([{ x: -60, y: 4 }], { release: false });

		expect(shift()).toBe(-60);
	});

	it('протягування до наступного кадру гортає', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		await gesture([{ x: -120, y: 6 }]);

		expect(frame()).toBe(1);
		expect(shift()).toBe(0);
	});

	it('перерваний жест не лишає фото зсунутим', async () => {
		render(ProductGallery, { images, name: 'Сукня' });
		const target = photo();

		await fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
		await fireEvent.pointerMove(target, { pointerId: 1, clientX: -40, clientY: 2 });
		// Браузер вирішив, що це прокрутка, і забрав жест собі.
		await fireEvent.pointerCancel(target, { pointerId: 1 });

		expect(shift()).toBe(0);
		expect(frame()).toBe(0);
	});

	it('короткий рух повертає кадр на місце', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		await gesture([{ x: -14, y: 2 }]);

		expect(frame()).toBe(0);
		expect(shift()).toBe(0);
	});

	it('на одному фото жест нічого не робить', async () => {
		render(ProductGallery, { images: [images[0]], name: 'Сукня' });

		await gesture([{ x: -150, y: 0 }]);

		expect(shift()).toBe(0);
	});
});

/**
 * Фото прив'язані до кольору варіанта: обрав білий — бачиш білу річ,
 * а не чорну. Це те, заради чого в БД зʼявилась колонка `color`.
 */
describe('галерея й колір', () => {
	it('показує кадри обраного кольору й спільні', () => {
		render(ProductGallery, { images: byColor, name: 'Сорочка', color: 'Чорний' });

		expect(shownUrls()).toEqual([
			'https://example.test/black-1.jpg',
			'https://example.test/black-2.jpg',
			'https://example.test/fabric.jpg'
		]);
	});

	it('зміна кольору змінює стрічку', async () => {
		const { rerender } = render(ProductGallery, {
			images: byColor,
			name: 'Сорочка',
			color: 'Чорний'
		});

		await rerender({ images: byColor, name: 'Сорочка', color: 'Білий' });

		expect(shownUrls()).toEqual([
			'https://example.test/white-1.jpg',
			'https://example.test/fabric.jpg'
		]);
	});

	it('після зміни кольору стрічка починається з першого кадру', async () => {
		const { rerender } = render(ProductGallery, {
			images: byColor,
			name: 'Сорочка',
			color: 'Чорний'
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Фото 2' }));
		expect(frame()).toBe(1);

		await rerender({ images: byColor, name: 'Сорочка', color: 'Білий' });
		expect(frame()).toBe(0);
	});

	it('кольору без власних фото показуємо все, що є', async () => {
		render(ProductGallery, { images: byColor, name: 'Сорочка', color: 'Бежевий' });

		expect(shownUrls()).toHaveLength(byColor.length);
	});

	it('без кольору показуємо всі кадри товару', () => {
		render(ProductGallery, { images: byColor, name: 'Сорочка' });

		expect(shownUrls()).toHaveLength(byColor.length);
	});
});
