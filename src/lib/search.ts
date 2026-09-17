/**
 * Пошук по каталогу: нормалізація, розбір запиту й оцінка схожості.
 *
 * Тут немає ні бази, ні мережі — лише текст. База дає документи,
 * `$lib/server/search` тримає з них покажчик у пам'яті, а вся логіка
 * «що вважати збігом» живе тут, щоб її можна було перевірити тестами.
 *
 * Чому не повнотекстовий пошук Postgres: для української в ньому немає
 * стемера, тож `to_tsvector` не звів би «сукні» й «сукня» — а це рівно те,
 * що покупець друкує. Тому збіг шукається по спільному корню, з поправкою
 * на одну описку.
 */

/**
 * Літери, які в українській і російській пишуть одна замість одної.
 * Покупець друкує як звик — «жилетка», «жілетка», «жылетка», — і всі три
 * мають знайти ту саму річ. М'який знак і апостроф просто прибираємо.
 */
const FOLD: Record<string, string> = {
	ё: 'е',
	є: 'е',
	э: 'е',
	ї: 'і',
	и: 'і',
	ы: 'і',
	ґ: 'г',
	ь: '',
	ъ: '',
	"'": '',
	ʼ: '',
	'’': ''
};

export function fold(text: string): string {
	let out = '';
	for (const letter of text.toLowerCase()) out += FOLD[letter] ?? letter;
	return out;
}

/** Слова: усе, що не літера й не цифра, — межа. */
export function words(text: string): string[] {
	return fold(text)
		.split(/[^\p{L}\p{N}]+/u)
		.filter((word) => word.length > 0);
}

/** Документ у тому вигляді, в якому його дає каталог. */
export type SearchDoc = {
	name: string;
	category: string;
	colors: string[];
	/** Артикули варіантів — щоб знаходити річ за артикулом із CRM. */
	skus: string[];
	description: string;
};

/** Той самий документ, розібраний на слова один раз наперед. */
export type IndexedDoc = {
	name: string[];
	category: string[];
	colors: string[];
	skus: string[];
	description: string[];
	/** Назва й категорія одним рядком — для бонуса за збіг цілої фрази. */
	phrase: string;
};

export function indexDoc(doc: SearchDoc): IndexedDoc {
	return {
		name: words(doc.name),
		category: words(doc.category),
		colors: doc.colors.flatMap(words),
		skus: doc.skus.map(fold),
		description: words(doc.description),
		phrase: fold(`${doc.name} ${doc.category}`)
	};
}

export type Query = {
	terms: string[];
	/** Уся фраза, як її ввели: збіг по ній цінніший за збіг по словах. */
	phrase: string;
};

/** Однолітерні слова відкидаємо: вони знаходять пів каталогу. */
export function prepareQuery(query: string): Query {
	return {
		terms: words(query).filter((term) => term.length >= 2),
		phrase: fold(query.trim())
	};
}

/** Наскільки поле важливе. Назва вагоміша за опис — там сама суть речі. */
const FIELD = {
	name: 10,
	sku: 9,
	category: 6,
	color: 5,
	description: 2
} as const;

/** Наскільки точний збіг. Ціле слово вагоміше за той самий корінь. */
const QUALITY = {
	exact: 1,
	prefix: 0.9,
	longer: 0.75,
	stem: 0.7,
	inside: 0.5,
	typo: 0.4
} as const;

/** Мінімальний спільний корінь: коротше — і «кава» знайшла б «кавун». */
const STEM_MIN = 4;

function commonPrefix(a: string, b: string): number {
	const limit = Math.min(a.length, b.length);
	let index = 0;
	while (index < limit && a[index] === b[index]) index += 1;
	return index;
}

/**
 * Одна описка: пропущена, зайва, замінена або переставлена літера.
 * Рахуємо не всю відстань Левенштейна, а лише чи вкладається вона в одну
 * правку — це швидко й цього достатньо для рядка пошуку.
 */
export function withinOneEdit(a: string, b: string): boolean {
	if (a === b) return true;
	if (Math.abs(a.length - b.length) > 1) return false;

	let i = 0;
	let j = 0;
	let slack = 1;

	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i += 1;
			j += 1;
			continue;
		}
		if (slack === 0) return false;
		slack = 0;

		if (a.length === b.length) {
			// Переставлені сусідні літери — одна правка, а не дві.
			if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
				i += 2;
				j += 2;
				continue;
			}
			i += 1;
			j += 1;
		} else if (a.length > b.length) {
			i += 1;
		} else {
			j += 1;
		}
	}

	return true;
}

/** Наскільки слово документа відповідає слову запиту: 0 — не відповідає. */
export function quality(term: string, word: string): number {
	if (word === term) return QUALITY.exact;
	if (word.startsWith(term)) return QUALITY.prefix;
	// Ввели більше, ніж є в назві: «жилетки» проти слова «жилет».
	if (word.length >= 3 && term.startsWith(word)) return QUALITY.longer;

	// Той самий корінь, різні закінчення: «сукні» ↔ «сукня».
	const prefix = commonPrefix(term, word);
	if (prefix >= STEM_MIN && prefix >= Math.min(term.length, word.length) - 2) {
		return QUALITY.stem;
	}

	if (term.length >= 3 && word.includes(term)) return QUALITY.inside;
	if (term.length >= 5 && withinOneEdit(term, word)) return QUALITY.typo;
	return 0;
}

/**
 * В описі збігом вважається лише ціле слово або його початок.
 *
 * Причина конкретна: в описі сукні написано «з вільною спідницею», і
 * поблажливе порівняння робило цю сукню відповіддю на запит «спідниця».
 * Назва, категорія й колір — це те, чим річ є, там здогадки доречні;
 * опис лише згадує, і здогадки в ньому дають дурні відповіді.
 */
function strictQuality(term: string, word: string): number {
	if (word === term) return QUALITY.exact;
	if (term.length >= 4 && word.startsWith(term)) return QUALITY.prefix;
	return 0;
}

function bestInField(
	term: string,
	field: readonly string[],
	match: (term: string, word: string) => number = quality
): number {
	let best = 0;
	for (const word of field) {
		const value = match(term, word);
		if (value > best) best = value;
		if (best === QUALITY.exact) break;
	}
	return best;
}

/**
 * Оцінка документа. Нуль означає «не підходить»: кожне слово запиту має
 * знайтись хоч десь, інакше «чорна сукня» повертала б і все чорне, і всі
 * сукні — тобто пів каталогу.
 */
export function score(query: Query, doc: IndexedDoc): number {
	if (query.terms.length === 0) return 0;

	let total = 0;
	for (const term of query.terms) {
		const best = Math.max(
			FIELD.name * bestInField(term, doc.name),
			FIELD.sku * bestInField(term, doc.skus),
			FIELD.category * bestInField(term, doc.category),
			FIELD.color * bestInField(term, doc.colors),
			FIELD.description * bestInField(term, doc.description, strictQuality)
		);
		if (best === 0) return 0;
		total += best;
	}

	// Ціла фраза в назві — найсильніший сигнал: людина шукає саме цю річ.
	if (query.phrase.length >= 3 && doc.phrase.includes(query.phrase)) total += 20;

	return total;
}
