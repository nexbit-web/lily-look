/**
 * Розміри фото під те місце, де його показують.
 *
 * Каталог наповнює CRM, і туди кладуть те, що є: бувають і PNG по два
 * мегабайти на картку розміром з долоню. Оригінал ніхто не міняє — фото
 * просять у CDN уже потрібної ширини й у форматі, який розуміє браузер.
 * На реальному кадрі це 1.8 МБ → 46 КБ.
 *
 * Чужий хост лишається як є: краще важке фото, ніж підмінене посилання.
 */

/** `f_auto` — AVIF/WebP за заголовком Accept, `c_limit` — ніколи не збільшувати. */
const CLOUDINARY_UPLOAD = '/image/upload/';

export function imageSrc(url: string, width: number): string {
	if (!url) return url;

	const upload = url.indexOf(CLOUDINARY_UPLOAD);
	if (url.includes('res.cloudinary.com') && upload !== -1) {
		const cut = upload + CLOUDINARY_UPLOAD.length;
		return `${url.slice(0, cut)}f_auto,q_auto,c_limit,w_${width}/${url.slice(cut)}`;
	}

	// Демо-каталог сидить на Unsplash — там ширина задається параметром.
	// Висоту тягнемо за нею, інакше зміниться кадрування.
	if (url.includes('images.unsplash.com')) {
		try {
			const parsed = new URL(url);
			const current = Number(parsed.searchParams.get('w'));
			const height = Number(parsed.searchParams.get('h'));
			if (current > 0 && height > 0) {
				parsed.searchParams.set('h', String(Math.round((height / current) * width)));
			}
			parsed.searchParams.set('w', String(width));
			return parsed.toString();
		} catch {
			return url;
		}
	}

	return url;
}

/**
 * `srcset` під кілька ширин: браузер сам візьме те, що треба для його
 * екрана й щільності пікселів. Без `sizes` поруч він вважатиме, що фото
 * на всю ширину вікна, — тому `sizes` обов'язковий у місці виклику.
 */
export function imageSrcSet(url: string, widths: readonly number[]): string | undefined {
	if (!url || imageSrc(url, widths[0]) === url) return undefined;
	return widths.map((width) => `${imageSrc(url, width)} ${width}w`).join(', ');
}

/** Ширини під типові місця витрини. */
export const IMAGE_WIDTHS = {
	/** Картка в сітці: 2 колонки на телефоні, 4 на десктопі. */
	card: [240, 320, 400, 560, 720],
	/** Банер на весь екран. */
	hero: [640, 800, 1024, 1280, 1600, 1920],
	/** Кружечок категорії. */
	tile: [160, 240, 320, 480],
	/** Головне фото товару. */
	gallery: [480, 640, 900, 1200, 1600],
	/** Мініатюра в кошику й замовленні. */
	thumb: [96, 144, 192, 288]
} as const;
