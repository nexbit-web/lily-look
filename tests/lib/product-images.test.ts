import { describe, expect, it } from 'vitest';
import { framesForColor } from '$lib/product-images';

/**
 * Одне правило на галерею й на обкладинку картки. Поки воно було в двох
 * місцях, місця розійшлись: на картці стояла чорна куртка, а за кліком
 * відкривалась біла, бо чорну вже розібрали.
 */

const frame = (color: string | null, url: string) => ({ url, alt: null, color });

const images = [
	frame('Чорний', 'ch-1.jpg'),
	frame('Чорний', 'ch-2.jpg'),
	frame(null, 'tkanyna.jpg'),
	frame('Білий', 'bi-1.jpg'),
	frame('Білий', 'bi-2.jpg')
];

describe('кадри обраного кольору', () => {
	it('бере свої кадри й спільні, чужі лишає осторонь', () => {
		expect(framesForColor(images, 'Білий').map((image) => image.url)).toEqual([
			'tkanyna.jpg',
			'bi-1.jpg',
			'bi-2.jpg'
		]);
	});

	it('порядок кадрів не міняється — його задає CRM', () => {
		expect(framesForColor(images, 'Чорний').map((image) => image.url)).toEqual([
			'ch-1.jpg',
			'ch-2.jpg',
			'tkanyna.jpg'
		]);
	});

	it('колір не обрано — показуємо весь набір', () => {
		expect(framesForColor(images, null)).toEqual(images);
	});

	/**
	 * Так виглядають старі картки, де колір у фото ще не проставлений:
	 * краще зайві кадри, ніж порожня галерея.
	 */
	it('у кольору немає жодного свого кадру — показуємо весь набір', () => {
		expect(framesForColor(images, 'Бежевий')).toEqual(images);
	});

	it('у товару взагалі немає фото — порожньо, і нічого не падає', () => {
		expect(framesForColor([], 'Чорний')).toEqual([]);
	});
});
