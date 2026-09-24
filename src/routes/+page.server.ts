import type { Banner } from '$lib/components/home/hero-slider.svelte';
import {
	CATALOG_CACHE_MS,
	COLLECTIONS,
	FREE_DELIVERY_FROM,
	HOME_BLOCK_SIZE,
	HOME_CATEGORY_LIMIT,
	HOME_EAGER_SECTIONS
} from '$lib/config';
import { formatPrice } from '$lib/money';
import {
	listCategoryCards,
	listCategoryProducts,
	listNewArrivals,
	listSale
} from '$lib/server/catalog';
import { cached } from '$lib/server/cache';
import type { CategoryCard, HomeSection, ProductCard } from '$lib/types';
import type { PageServerLoad } from './$types';

/**
 * Головна однакова для всіх, а зібрати її — це кілька запитів у Neon.
 * Тримаємо готову відповідь у пам'яті: перший відвідувач за хвилину платить
 * за читання з бази, решта отримує сторінку одразу.
 */
async function buildHome() {
	// Порядок блоків = порядок, у якому покупець приймає рішення: спершу
	// «куди дивитись» (категорії), потім «де вигода», потім «що нового»,
	// і аж потім весь асортимент полицями.
	const [categories, saleRows, freshRows] = await Promise.all([
		listCategoryCards(),
		listSale(HOME_BLOCK_SIZE * 3),
		listNewArrivals(HOME_BLOCK_SIZE * 3)
	]);

	// Два верхні блоки не мають повторювати одне одного: та сама сукня
	// двічі поспіль виглядає як помилка й не додає приводу купити. Нижче,
	// у стрічках категорій, повтори нормальні — там річ стоїть на своїй полиці.
	const shown = new Set<string>();
	const take = (rows: ProductCard[]) => {
		const picked = rows.filter((row) => !shown.has(row.id)).slice(0, HOME_BLOCK_SIZE);
		for (const row of picked) shown.add(row.id);
		return picked;
	};

	const sale = take(saleRows);

	// У «Новинках» не місце знижкам: знижена річ — це залишок попередньої
	// колекції, а не свіже надходження. Якщо повнокоштовних новинок мало,
	// краще показати хоч щось, ніж порожній ряд.
	const fullPriceFresh = freshRows.filter((row) => row.compareAt === null);
	const newArrivals = take(fullPriceFresh.length >= HOME_BLOCK_SIZE ? fullPriceFresh : freshRows);

	// Стрічки категорій. Перші кілька віддаємо разом зі сторінкою — їх видно
	// майже одразу, і вони мають бути в HTML для пошуковика. Решта попросить
	// свої картки сама, коли покупець до неї догортає: головна не важчає від
	// того, що в CRM завели ще десять категорій.
	const eager = await Promise.all(
		categories
			.slice(0, HOME_EAGER_SECTIONS)
			.map((category) => listCategoryProducts(category.slug, HOME_CATEGORY_LIMIT))
	);

	const sections: HomeSection[] = categories.map((category, index) => ({
		slug: category.slug,
		name: category.name,
		productCount: category.productCount,
		products: eager[index] ?? null
	}));

	return {
		banners: buildBanners(categories),
		// Прев'ю посилання на головну в месенджерах — свіжа річ з каталогу, а
		// не банер: банери лежать в AVIF, якого частина месенджерів не покаже,
		// а фото з CDN каталогу віддається в JPEG.
		shareImage: freshRows[0]?.image?.url ?? null,
		categories,
		sale,
		newArrivals,
		sections
	};
}

/**
 * Банери — готові картинки з `static/banners`, текст уже на них.
 *
 * Банер, що кличе до товару, показується, лише поки цей товар є: клік по
 * «Демісезонних куртках», які розібрали, вів би в порожню категорію.
 * Адресу категорії беремо з каталогу за назвою, а не зашиваємо: CRM може
 * змінити slug, і банер тихо вів би в 404.
 */
function buildBanners(categories: CategoryCard[]): Banner[] {
	const inStock = new Set(categories.map((category) => category.slug));
	const autumn = COLLECTIONS.find((collection) => collection.slug === 'autumn');
	const jackets = categories.find((category) => /демісезон/i.test(category.name));

	return [
		...(autumn && autumn.categories.some((slug) => inStock.has(slug))
			? [
					{
						image: '/banners/autumn-collection',
						alt: `${autumn.name} — теплі образи для прохолодних днів`,
						href: `/collection/${autumn.slug}`
					}
				]
			: []),
		...(jackets
			? [
					{
						image: '/banners/demi-season-jackets',
						alt: 'Демісезонні куртки — стильні моделі для мінливої погоди',
						href: `/catalog/${jackets.slug}`
					}
				]
			: []),
		// Умова, а не товар: клікати тут нікуди.
		{
			image: '/banners/free-delivery',
			alt: `Безкоштовна доставка від ${formatPrice(FREE_DELIVERY_FROM)}`,
			href: null
		}
	];
}

/**
 * Кешуємо в пам'яті процесу, а не на CDN.
 *
 * Спільний кеш (`s-maxage`) тут був би помилкою: у HTML сторінки зашитий
 * лічильник кошика з шапки, а CDN хостингу віддає збережену копію всім
 * підряд, не дивлячись на куки. Покупець із трьома речами в кошику бачив
 * би нуль — або чужі п'ять. Дорога частина головної — запити в базу — і
 * так закешована тут, тож без CDN сторінка лише трохи довше йде мережею.
 */
export const load: PageServerLoad = async () => {
	return cached('home', CATALOG_CACHE_MS, buildHome);
};
