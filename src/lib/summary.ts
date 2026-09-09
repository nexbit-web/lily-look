/**
 * Короткий переказ тексту для `<meta name="description">`.
 *
 * Просте `slice` ріже слово навпіл, і у видачі Google це видно: «…однаково
 * дореч Ціна 1 869 грн». Тому обрізаємо по межі речення, а якщо його поруч
 * немає — по межі слова, і ставимо трикрапку.
 */
export function summarize(text: string, limit: number): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (clean.length <= limit) return clean;

	const cut = clean.slice(0, limit);

	// Ціле речення читається краще за обірвану фразу — але тільки якщо воно
	// не з'їдає більшу частину ліміту.
	const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
	if (sentence >= limit / 2) return cut.slice(0, sentence + 1);

	const space = cut.lastIndexOf(' ');
	return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[,;:—-]$/, '')}…`;
}
