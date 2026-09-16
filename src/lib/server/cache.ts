import { dev } from '$app/environment';

/**
 * Коротка пам'ять на читання з каталогу.
 *
 * Кожне відкриття головної — це кілька запитів у Neon, а Neon стоїть не
 * в сусідній кімнаті: разом виходить близько третини секунди, яку платить
 * кожен відвідувач за однакову відповідь. Каталог змінює CRM, і хвилина
 * затримки тут нікого не ламає — сторінка й так віддається із
 * `s-maxage=60`, просто без CDN це обіцянку нікому не давало.
 *
 * Сторінку товару свідомо не кешуємо: там вирішує залишок на складі.
 *
 * У режимі розробки кеш вимкнений — інакше правки в базі не видно.
 */

type Entry = { value: Promise<unknown>; expires: number };

const store = new Map<string, Entry>();

/** Стеля на кількість ключів: захист від нескінченного росту на чужих slug. */
const MAX_KEYS = 200;

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
	if (dev || ttlMs <= 0) return load();

	const now = Date.now();
	const hit = store.get(key);
	// Зберігаємо саму обіцянку, а не результат: поки перший запит іде в базу,
	// решта чекає на нього, а не запускає той самий запит ще раз.
	if (hit && hit.expires > now) return hit.value as Promise<T>;

	const value = load().catch((error: unknown) => {
		// Помилка не має залипати в кеші на хвилину — наступний спроба піде в базу.
		if (store.get(key)?.value === value) store.delete(key);
		throw error;
	});

	if (store.size >= MAX_KEYS) {
		for (const [name, entry] of store) {
			if (entry.expires <= now) store.delete(name);
		}
		// Прострочених не знайшлось — чистимо все: це дешевше за витік пам'яті.
		if (store.size >= MAX_KEYS) store.clear();
	}

	store.set(key, { value, expires: now + ttlMs });
	return value;
}

/** Тільки для тестів: почати з чистого аркуша. */
export function clearCache() {
	store.clear();
}
