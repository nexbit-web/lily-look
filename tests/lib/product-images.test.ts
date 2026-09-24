import { describe, expect, it } from 'vitest';
import { framesForColor, imageAlt } from '$lib/product-images';

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

describe('підпис до фото', () => {
	/**
	 * Підпис читають скрінрідер, Google Картинки й прев'ю в месенджерах.
	 * У живому каталозі були «Тест2» і «NBoy» — саме від такого й захист.
	 */
	it('заглушку замінює назва товару з кольором кадру', () => {
		expect(imageAlt('Тест2', 'Чорне жіноче пальто', 'Чорний')).toBe('Чорне жіноче пальто — чорний');
		expect(imageAlt('test', 'Бомбер', null)).toBe('Бомбер');
		expect(imageAlt('фото 3', 'Бомбер', null)).toBe('Бомбер');
	});

	it('одне слово нічого не описує', () => {
		expect(imageAlt('NBoy', 'Червона сорочка оверсайз', null)).toBe('Червона сорочка оверсайз');
	});

	it('порожній підпис — теж назва товару', () => {
		expect(imageAlt(null, 'Бомбер', 'Хакі')).toBe('Бомбер — хакі');
		expect(imageAlt('   ', 'Бомбер', null)).toBe('Бомбер');
	});

	it('змістовний підпис із CRM лишається як є', () => {
		expect(imageAlt('Куртка(Весна) відтінок хакі', 'Куртка', 'Хакі')).toBe(
			'Куртка(Весна) відтінок хакі'
		);
		// Слово «тест» усередині справжнього опису — не заглушка.
		expect(imageAlt('Тестер кольору на рукаві', 'Куртка', null)).toBe('Тестер кольору на рукаві');
	});
});
