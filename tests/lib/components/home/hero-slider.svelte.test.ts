import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import HeroSlider, { type Banner } from '$lib/components/home/hero-slider.svelte';

/**
 * Банери на головній — готові картинки з текстом.
 *
 * Прихований слайд позначений `aria-hidden`, тож запити за роллю бачать
 * рівно те, що зараз на екрані: так і перевіряємо, який банер показаний.
 */

const banners: Banner[] = [
	{ image: '/banners/autumn', alt: 'Осіння колекція', href: '/collection/autumn' },
	{ image: '/banners/jackets', alt: 'Демісезонні куртки', href: '/catalog/demisezonni-kurtky' },
	{ image: '/banners/delivery', alt: 'Безкоштовна доставка', href: null }
];

/**
 * Перший кадр приїхав — сусідні слайди з'являються в розмітці. До того їх
 * немає зовсім, щоб не забирали канал у найбільшого фото сторінки.
 */
function firstImageLoaded() {
	fireEvent.load(screen.getByRole('img', { name: 'Осіння колекція' }));
}

function swipe(dx: number, dy = 0) {
	const carousel = screen.getByRole('region', { name: 'Акції та новинки' });
	fireEvent.touchStart(carousel, { touches: [{ clientX: 200, clientY: 100 }] });
	fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 200 + dx, clientY: 100 + dy }] });
}

const visible = () => screen.getAllByRole('img').map((image) => image.getAttribute('alt'));

describe('банери на головній', () => {
	it('картинка і є посиланням — окремої кнопки немає', () => {
		render(HeroSlider, { banners });

		const link = screen.getByRole('link', { name: 'Осіння колекція' });
		expect(link.getAttribute('href')).toBe('/collection/autumn');
		expect(screen.queryByRole('button', { name: /дивитись|обрати/i })).toBeNull();
	});

	it('кадр — AVIF під ширину екрана, а для старих iPhone — WebP', () => {
		const { container } = render(HeroSlider, { banners });

		const source = container.querySelector('source');
		expect(source?.getAttribute('type')).toBe('image/avif');
		expect(source?.getAttribute('srcset')).toBe(
			'/banners/autumn-960.avif 960w, /banners/autumn-1280.avif 1280w, /banners/autumn-1916.avif 1916w'
		);
		expect(screen.getByRole('img', { name: 'Осіння колекція' }).getAttribute('src')).toBe(
			'/banners/autumn-1280.webp'
		);
	});

	it('банер про доставку нікуди не веде', async () => {
		render(HeroSlider, { banners });
		firstImageLoaded();

		await fireEvent.click(screen.getByRole('button', { name: 'Банер 3' }));

		expect(visible()).toEqual(['Безкоштовна доставка']);
		expect(screen.queryByRole('link', { name: 'Безкоштовна доставка' })).toBeNull();
	});

	it('прихований банер не ловить фокус з клавіатури', () => {
		render(HeroSlider, { banners });
		firstImageLoaded();

		const hidden = screen.getByRole('link', { name: 'Демісезонні куртки', hidden: true });
		expect(hidden.getAttribute('tabindex')).toBe('-1');
	});
});

describe('свайп на телефоні', () => {
	it('вліво — наступний банер, вправо — знову попередній', async () => {
		render(HeroSlider, { banners });
		firstImageLoaded();

		swipe(-80);
		await Promise.resolve();
		expect(visible()).toEqual(['Демісезонні куртки']);

		swipe(80);
		await Promise.resolve();
		expect(visible()).toEqual(['Осіння колекція']);
	});

	it('з першого вправо — останній: гортається по колу', async () => {
		render(HeroSlider, { banners });
		firstImageLoaded();

		swipe(80);
		await Promise.resolve();

		expect(visible()).toEqual(['Безкоштовна доставка']);
	});

	it('прокрутка сторінки й тремтіння пальця банер не перемикають', async () => {
		render(HeroSlider, { banners });
		firstImageLoaded();

		// Палець їде вниз і трохи вбік — це прокрутка.
		swipe(-60, 200);
		// Тап із ледь помітним зсувом — це клік по банеру.
		swipe(-10);
		await Promise.resolve();

		expect(visible()).toEqual(['Осіння колекція']);
	});
});
