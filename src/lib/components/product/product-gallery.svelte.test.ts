import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProductGallery from './product-gallery.svelte';

const images = [
	{ url: 'https://example.test/1.jpg', alt: 'Фото спереду' },
	{ url: 'https://example.test/2.jpg', alt: 'Фото збоку' },
	{ url: 'https://example.test/3.jpg', alt: 'Деталь тканини' }
];

/** Стрічка кадрів: перемикання — це зсув на 100% ширини за кадр. */
const shift = () =>
	(document.querySelector('[style*="translate3d"]') as HTMLElement).style.transform;

describe('галерея товару', () => {
	it('тримає всі кадри в стрічці й мініатюру на кожен', () => {
		render(ProductGallery, { images, name: 'Сукня' });

		expect(screen.getAllByRole('img')).toHaveLength(3);
		expect(screen.getAllByRole('button', { name: /^Фото \d$/ })).toHaveLength(3);
		expect(shift()).toContain('-0%');
	});

	it('мініатюра зсуває стрічку на потрібний кадр', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		await fireEvent.click(screen.getByRole('button', { name: 'Фото 2' }));

		expect(shift()).toContain('-100%');
		expect(screen.getByRole('button', { name: 'Фото 2' })).toHaveAttribute('aria-current', 'true');
	});

	it('стрілки гортають по колу', async () => {
		render(ProductGallery, { images, name: 'Сукня' });

		await fireEvent.click(screen.getByRole('button', { name: 'Попереднє фото' }));
		expect(shift()).toContain('-200%');

		await fireEvent.click(screen.getByRole('button', { name: 'Наступне фото' }));
		expect(shift()).toContain('-0%');
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
