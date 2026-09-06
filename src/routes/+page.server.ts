import type { Banner } from '$lib/components/home/hero-slider.svelte';
import { FREE_DELIVERY_FROM } from '$lib/config';
import { formatPrice } from '$lib/money';
import { listCategoryCards, listFeatured, listNewArrivals, listSale } from '$lib/server/catalog';
import type { ProductCard } from '$lib/types';
import type { PageServerLoad } from './$types';

/** Скільки карток у кожному блоці головної — рівно один ряд на десктопі. */
const BLOCK_SIZE = 4;

export const load: PageServerLoad = async ({ setHeaders }) => {
	// Порядок блоків на сторінці = порядок, у якому покупець приймає рішення:
	// спершу «куди дивитись» (категорії), потім «що нового», потім «де вигода»,
	// і вже наостанок — перевірені бестселери.
	const [categories, freshRows, saleRows, featuredRows] = await Promise.all([
		listCategoryCards(),
		listNewArrivals(BLOCK_SIZE * 3),
		listSale(BLOCK_SIZE * 3),
		listFeatured(BLOCK_SIZE * 3)
	]);

	// Блоки не мають повторювати одне одного: сторінка з тією самою сукнею
	// у трьох рядах виглядає як помилка й не додає жодного нового приводу
	// купити. Тому кожен наступний блок бере лише те, чого ще не показали.
	const shown = new Set<string>();
	const take = (rows: ProductCard[]) => {
		const picked = rows.filter((row) => !shown.has(row.id)).slice(0, BLOCK_SIZE);
		for (const row of picked) shown.add(row.id);
		return picked;
	};

	// У «Новинках» не місце знижкам: знижена річ — це залишок попередньої
	// колекції, а не свіже надходження. Якщо повнокоштовних новинок мало,
	// краще показати хоч щось, ніж порожній ряд.
	const fullPriceFresh = freshRows.filter((row) => row.compareAt === null);
	const newArrivals = take(fullPriceFresh.length >= BLOCK_SIZE ? fullPriceFresh : freshRows);
	const sale = take(saleRows);
	const featured = take(featuredRows);

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
			text: 'Нова Пошта по всій Україні. Обмін і повернення — 14 днів без пояснень.',
			cta: { label: 'Обрати образ', href: '/catalog' },
			image: (featuredRows[1] ?? featuredRows[0])?.image?.url ?? null,
			tone: 'neutral'
		}
	];

	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });

	return { banners, categories, newArrivals, sale, featured };
};
