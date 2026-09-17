import { describe, expect, it } from 'vitest';
import { IMAGE_WIDTHS, imageSrc, imageSrcSet } from './image.js';

/**
 * Фото в каталозі — чужі: їх заливає CRM, і оригінали бувають величезні.
 * Тут перевіряємо, що посилання просить у CDN потрібну ширину й що
 * незнайомий хост лишається недоторканим.
 */

const cloudinary =
	'https://res.cloudinary.com/demo/image/upload/v1789142172/lily-look/products/abc.png';

describe('розмір фото', () => {
	it('просить у Cloudinary потрібну ширину й формат під браузер', () => {
		expect(imageSrc(cloudinary, 400)).toBe(
			'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_400/v1789142172/lily-look/products/abc.png'
		);
	});

	it('не збільшує маленький оригінал — c_limit на місці', () => {
		expect(imageSrc(cloudinary, 1600)).toContain('c_limit');
	});

	it('на Unsplash тягне висоту за шириною, щоб не змінити кадрування', () => {
		const url = imageSrc(
			'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=1200&h=1600&q=80',
			600
		);

		expect(new URL(url).searchParams.get('w')).toBe('600');
		expect(new URL(url).searchParams.get('h')).toBe('800');
	});

	it('чужий хост лишається як є', () => {
		const url = 'https://example.test/photo.jpg';

		expect(imageSrc(url, 400)).toBe(url);
		expect(imageSrcSet(url, [400, 800])).toBeUndefined();
	});

	it('на весь сайт лише три ширини — інакше CDN ріже кадри під кожну', () => {
		const all = new Set(Object.values(IMAGE_WIDTHS).flat());

		// Кожна зайва ширина — це окремий файл, який CDN виготовляє при
		// першому запиті, і сіра пляма на місці фото, поки він це робить.
		expect([...all].sort((a, b) => a - b)).toEqual([400, 800, 1600]);
	});

	it('srcset перелічує всі ширини', () => {
		const set = imageSrcSet(cloudinary, [240, 480]);

		expect(set).toContain('w_240/v1789142172/lily-look/products/abc.png 240w');
		expect(set).toContain('w_480/v1789142172/lily-look/products/abc.png 480w');
	});

	it('порожнє посилання не ламає нічого', () => {
		expect(imageSrc('', 400)).toBe('');
		expect(imageSrcSet('', [400])).toBeUndefined();
	});
});
