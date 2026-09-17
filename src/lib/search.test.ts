import { describe, expect, it } from 'vitest';
import { fold, indexDoc, prepareQuery, quality, score, withinOneEdit, words } from './search.js';

/**
 * Пошук перевіряємо з боку покупця: він друкує як вміє — з іншим
 * закінченням, іншою літерою, з опискою — і має знайти річ. І навпаки:
 * випадковий набір літер не має знаходити нічого.
 */

const doc = indexDoc({
	name: 'Стьобана куртка Lea',
	category: 'Верхній одяг',
	colors: ['Чорний', 'Відтінок хакі'],
	skus: ['KURTKA-STEBANA-LEA-M-ЧОРНИЙ'],
	description: 'Тепла стьобана куртка з водовідштовхувальної тканини на синтепоні.'
});

const found = (query: string) => score(prepareQuery(query), doc) > 0;

describe('нормалізація', () => {
	it('зводить літери, які пишуть одна замість одної', () => {
		expect(fold('жілетка')).toBe(fold('жилетка'));
		expect(fold('пальтє')).toBe(fold('пальте'));
		expect(fold("м'який")).toBe(fold('мякий'));
	});

	it('ріже на слова по всьому, що не літера', () => {
		expect(words('Сукня-міді, Amélie 2.0')).toEqual(['сукня', 'міді', 'amélie', '2', '0']);
	});
});

describe('одна описка', () => {
	it('ловить пропущену, зайву, замінену й переставлену літеру', () => {
		expect(withinOneEdit('куртка', 'курка')).toBe(true);
		expect(withinOneEdit('курртка', 'куртка')).toBe(true);
		expect(withinOneEdit('куртка', 'кортка')).toBe(true);
		expect(withinOneEdit('куртка', 'кутрка')).toBe(true);
	});

	it('дві описки — це вже інше слово', () => {
		expect(withinOneEdit('куртка', 'кортока')).toBe(false);
		expect(withinOneEdit('куртка', 'сукня')).toBe(false);
	});
});

describe('що вважати збігом', () => {
	it('ціле слово цінніше за початок, початок — за корінь', () => {
		expect(quality('куртка', 'куртка')).toBeGreaterThan(quality('курт', 'куртка'));
		expect(quality('курт', 'куртка')).toBeGreaterThan(quality('куртці', 'куртка'));
	});

	it('різні закінчення — той самий корінь', () => {
		expect(quality('сукні', 'сукня')).toBeGreaterThan(0);
		expect(quality('жилетки', 'жилетка')).toBeGreaterThan(0);
	});

	it('схожий початок при різній суті збігом не вважається', () => {
		expect(quality('кава', 'кавун')).toBe(0);
	});
});

describe('пошук по товару', () => {
	it('знаходить за назвою, категорією, кольором і артикулом', () => {
		expect(found('куртка')).toBe(true);
		expect(found('верхній одяг')).toBe(true);
		expect(found('хакі')).toBe(true);
		expect(found('KURTKA-STEBANA-LEA-M-ЧОРНИЙ')).toBe(true);
	});

	it('знаходить за іншим закінченням і з опискою', () => {
		expect(found('куртки')).toBe(true);
		expect(found('курткa стьобана')).toBe(true);
		expect(found('кутрка')).toBe(true);
	});

	it('слова можна вводити в будь-якому порядку', () => {
		expect(found('lea куртка')).toBe(true);
		expect(found('куртка lea')).toBe(true);
	});

	it('усі слова запиту мають знайтись — інакше це не та річ', () => {
		// «сукня» в цьому товарі немає, тож запит не підходить цілком.
		expect(found('чорна сукня')).toBe(false);
		expect(found('куртка сукня')).toBe(false);
	});

	it('випадковий набір літер не знаходить нічого', () => {
		expect(found('qwerty')).toBe(false);
		expect(found('ячсмить')).toBe(false);
	});

	it('порожній запит не знаходить нічого', () => {
		expect(found('')).toBe(false);
		expect(found('   ')).toBe(false);
	});

	it('збіг цілої фрази важить більше за ті самі слова окремо', () => {
		const phrase = score(prepareQuery('стьобана куртка'), doc);
		const apart = score(prepareQuery('куртка тканини'), doc);

		expect(phrase).toBeGreaterThan(apart);
	});

	it('в описі шукаємо строго — інакше згадка робить дурні відповіді', () => {
		// «синтепоні» в описі є цілим словом — знаходимо.
		expect(found('синтепоні')).toBe(true);
		// А «тканина» там лише у формі «тканини»: у назві така поблажливість
		// доречна, в описі — ні, бо так сукня «з вільною спідницею»
		// ставала б відповіддю на запит «спідниця».
		expect(found('тканина')).toBe(false);
	});

	it('назва важить більше за опис', () => {
		const byName = score(prepareQuery('куртка'), doc);
		const byDescription = score(prepareQuery('синтепоні'), doc);

		expect(byName).toBeGreaterThan(byDescription);
	});
});
