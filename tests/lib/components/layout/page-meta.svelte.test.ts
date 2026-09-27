import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageMeta from '$lib/components/layout/page-meta.svelte';

/**
 * Мета-теги — те, що бачать Google і месенджери. Помилка тут не видна на
 * сторінці, зате видна у видачі: не той canonical склеїть сторінки, не той
 * robots викине їх з індексу.
 */

vi.mock('$app/state', () => ({
	page: { url: new URL('https://lilylook.store/catalog/sukni?size=M&sort=price-asc') }
}));

const meta = (selector: string) => document.head.querySelector(selector)?.getAttribute('content');
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');

afterEach(() => {
	document.head.innerHTML = '';
});

describe('мета-теги сторінки', () => {
	it('заголовок, опис і Open Graph — з тих самих рядків', () => {
		render(PageMeta, { title: 'Сукні — LILY LOOK', description: 'Жіночі сукні' });

		expect(document.title).toBe('Сукні — LILY LOOK');
		expect(meta('meta[name="description"]')).toBe('Жіночі сукні');
		expect(meta('meta[property="og:title"]')).toBe('Сукні — LILY LOOK');
		expect(meta('meta[property="og:locale"]')).toBe('uk_UA');
	});

	it('canonical — абсолютний, без фільтрів у поточній адресі', () => {
		render(PageMeta, { title: 't', description: 'd' });

		expect(canonical()).toBe('https://lilylook.store/catalog/sukni');
		expect(meta('meta[property="og:url"]')).toBe('https://lilylook.store/catalog/sukni');
	});

	it('явний canonical зі сторінки розгортається від домену', () => {
		render(PageMeta, { title: 't', description: 'd', canonical: '/catalog/sukni?page=2' });

		expect(canonical()).toBe('https://lilylook.store/catalog/sukni?page=2');
	});

	it('за замовчуванням сторінка в індексі, з великими прев’ю картинок', () => {
		render(PageMeta, { title: 't', description: 'd' });

		expect(meta('meta[name="robots"]')).toBe('index, follow, max-image-preview:large');
	});

	it('index=false — noindex, але посилання Google обходить далі', () => {
		render(PageMeta, { title: 't', description: 'd', index: false });

		expect(meta('meta[name="robots"]')).toBe('noindex, follow');
	});

	it('фото з Cloudinary для прев’ю — JPEG, не AVIF', () => {
		render(PageMeta, {
			title: 't',
			description: 'd',
			image: 'https://res.cloudinary.com/lily/image/upload/v1/a.jpg'
		});

		expect(meta('meta[property="og:image"]')).toContain('/upload/f_jpg,');
		expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
	});

	it('відносне фото стає абсолютним — інакше месенджер прев’ю не збудує', () => {
		render(PageMeta, { title: 't', description: 'd', image: '/share.jpg' });

		expect(meta('meta[property="og:image"]')).toMatch(/^https:\/\/lilylook\.store\//);
	});

	it('ціна товару для соцмереж — у гривнях з копійками', () => {
		render(PageMeta, { title: 't', description: 'd', type: 'product', price: 264_900 });

		expect(meta('meta[property="product:price:amount"]')).toBe('2649.00');
		expect(meta('meta[property="product:price:currency"]')).toBe('UAH');
	});
});
