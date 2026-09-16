import type { Banner } from '$lib/components/home/hero-slider.svelte';
import {
	CATALOG_CACHE_MS,
	FREE_DELIVERY_FROM,
	HOME_BLOCK_SIZE,
	HOME_CATEGORY_LIMIT,
	HOME_EAGER_SECTIONS,
	RETURN_DAYS
} from '$lib/config';
import { formatPrice } from '$lib/money';
import { plural } from '$lib/plural';
import {
	listCategoryCards,
	listCategoryProducts,
	listNewArrivals,
	listSale
} from '$lib/server/catalog';
import { cached } from '$lib/server/cache';
import type { HomeSection, ProductCard } from '$lib/types';
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

	// Банери збираються з реального каталогу: якщо знижок немає — слайд
	// про знижки просто не показується, замість порожньої заглушки.
	const banners: Banner[] = [
		{
			eyebrow: 'Нова колекція',
			title: 'Одяг, у якому вас запам’ятовують',
			text: 'Сукні, костюми й верхній одяг обмеженими партіями.',
			cta: { label: 'Дивитись колекцію', href: '/catalog' },
			image: freshRows[0]?.image?.url ?? null,
			tone: 'neutral'
		},
		// Слайд про знижки живе, поки в каталозі взагалі є знижена річ —
		// навіть якщо всі вони вже показані в блоці новинок вище.
		...(saleRows[0]
			? [
					{
						eyebrow: 'Сезонний розпродаж',
						title: 'Останні розміри — за новою ціною',
						text: 'Речі з попередньої колекції. Коли розберуть — не повернемо.',
						cta: { label: 'До знижок', href: '/catalog?sale=1' },
						image: saleRows[0].image?.url ?? null,
						tone: 'brand' as const
					}
				]
			: []),
		{
			eyebrow: 'Доставка',
			title: `Безкоштовно від ${formatPrice(FREE_DELIVERY_FROM)}`,
			text: `Нова Пошта по всій Україні. Обмін і повернення — ${RETURN_DAYS} ${plural(RETURN_DAYS, 'день', 'дні', 'днів')} без пояснень.`,
			cta: { label: 'Обрати образ', href: '/catalog' },
			image: (freshRows[1] ?? freshRows[0])?.image?.url ?? null,
			tone: 'neutral'
		}
	];

	return { banners, categories, sale, newArrivals, sections };
}

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	return cached('home', CATALOG_CACHE_MS, buildHome);
};
