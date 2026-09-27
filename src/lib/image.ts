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

/**
 * Чотири ширини на весь сайт — і жодної більше.
 *
 * Кожна нова ширина — це окремий файл, який CDN виготовляє при першому
 * запиті: близько 0.8 с проти 0.3 с для готового. Коли ширин багато,
 * кожна сторінка замовляє купу кадрів, яких ще ніхто не просив, — і
 * покупець дивиться на сірі плями, поки їх ріжуть. А коли ширини спільні
 * для всіх місць, той самий файл, виготовлений для картки на головній,
 * одразу підходить і для підказки в пошуку, і для кошика, і для кружечка
 * категорії.
 *
 * `small` покриває все дрібне (мініатюри, кружечки, підказки), `card` —
 * картки в сітці, `medium` — галерея товару й плитки категорій, `large` —
 * перегляд на весь екран.
 */
const SMALL = 400;
const CARD = 600;
const MEDIUM = 800;
const LARGE = 1600;

export const IMAGE_WIDTHS = {
	/** Банер на весь екран і фото товару. */
	hero: [MEDIUM, LARGE],
	gallery: [MEDIUM, LARGE]
} as const;

/**
 * Картка в сітці — завжди один розмір, без `srcset`.
 *
 * Два розміри на вибір браузера означали два файли на кожне фото, і кожен
 * CDN ріже окремо при першому запиті (1.5 с проти 0.3 с для готового):
 * телефон просив 400, десктоп — 800, і обидва частіше натрапляли на ще не
 * нарізаний кадр. Один розмір нарізається один раз і далі віддається
 * готовим усім.
 *
 * 600 — стеля того, що картка реально займає: дві колонки на телефоні з
 * щільністю ×3 — до ~600 точок, чотири колонки на десктопі з ретиною —
 * ~530. Було 800, але на телефоні це зайві ~40 % ваги на кожній картці:
 * Lighthouse рахував 660 КБ зайвого на головній.
 */
export const IMAGE_CARD = CARD;

/**
 * Плитка категорії на вітрині /catalog — на телефоні вона на всю ширину
 * екрана, тож їй потрібен кадр більший за картку. Фото категорій — інші,
 * ніж фото товарів, тож зайвої нарізки товарних кадрів це не додає.
 */
export const IMAGE_TILE = MEDIUM;

/** Одна ширина для всього дрібного: кружечки, мініатюри, підказки пошуку. */
export const IMAGE_SMALL = SMALL;
/** Найбільший кадр — для розмітки Open Graph і Schema.org. */
export const IMAGE_LARGE = LARGE;

/**
 * Фото для чужих систем: фід Google Merchant і прев'ю посилань у
 * месенджерах.
 *
 * `f_auto` тут не годиться. Формат він обирає за заголовком Accept того,
 * хто просить, а частина фото в каталозі й так залита в AVIF. Роботу, який
 * пообіцяв розуміти AVIF, дістанеться AVIF — а Merchant Center його не
 * приймає, і позиція вилітає з Google Покупок через «непідтримуване фото».
 * JPEG розуміють усі; вага тут не важлива — ці кадри не вантажить покупець.
 */
export function portableImageSrc(url: string): string {
	const upload = url.indexOf(CLOUDINARY_UPLOAD);
	if (url.includes('res.cloudinary.com') && upload !== -1) {
		const cut = upload + CLOUDINARY_UPLOAD.length;
		return `${url.slice(0, cut)}f_jpg,q_auto,c_limit,w_${LARGE}/${url.slice(cut)}`;
	}
	return imageSrc(url, LARGE);
}

/**
 * CDN не віддав зменшений кадр — показуємо оригінал.
 *
 * Важить більше, але сіра пляма замість речі коштувала б дорожче.
 * Позначка в `dataset` рятує від нескінченного колеса, якщо й оригінал
 * недоступний.
 */
export function fallbackToOriginal(event: Event, url: string) {
	const image = event.currentTarget;
	if (!(image instanceof HTMLImageElement) || image.dataset.fallback === 'done') return;
	image.dataset.fallback = 'done';
	image.srcset = '';
	image.src = url;
}
