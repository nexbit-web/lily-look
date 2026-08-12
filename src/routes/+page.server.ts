import type { Banner } from '$lib/components/home/hero-slider.svelte';
import { FREE_DELIVERY_FROM } from '$lib/config';
import { formatPrice } from '$lib/money';
import { listFeatured, listNewArrivals, listSale } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	const [featured, newArrivals, sale] = await Promise.all([
		listFeatured(8),
		listNewArrivals(4),
		listSale(1)
	]);

	// Банери збираються з реального каталогу: якщо знижок немає — слайд
	// про знижки просто не показується, замість порожньої заглушки.
	const banners: Banner[] = [
		{
			eyebrow: 'Нова колекція',
			title: 'Одяг, у якому вас запам’ятовують',
			text: 'Сукні, костюми й верхній одяг обмеженими партіями.',
			cta: { label: 'Дивитись колекцію', href: '/catalog' },
			image: newArrivals[0]?.image?.url ?? null,
			tone: 'neutral'
		},
		...(sale[0]
			? [
					{
						eyebrow: 'Сезонний розпродаж',
						title: 'Знижки до 20% на обране',
						text: 'Останні розміри з попередньої колекції. Коли розберуть — не повернемо.',
						cta: { label: 'До знижок', href: '/catalog?sale=1' },
						image: sale[0].image?.url ?? null,
						tone: 'brand' as const
					}
				]
			: []),
		{
			eyebrow: 'Доставка',
			title: `Безкоштовно від ${formatPrice(FREE_DELIVERY_FROM)}`,
			text: 'Нова Пошта по всій Україні. Обмін і повернення — 14 днів без пояснень.',
			cta: { label: 'Обрати образ', href: '/catalog' },
			image: featured[1]?.image?.url ?? null,
			tone: 'neutral'
		}
	];

	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });

	return { banners, featured, newArrivals };
};
