import { RETURN_DAYS } from '$lib/config';
import type { ProductDetail } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddToCartForm from './add-to-cart-form.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
vi.mock('svelte-hot-french-toast', () => ({
	default: { success: vi.fn(), error: vi.fn() }
}));

const variant = (patch: Partial<ProductDetail['variants'][number]>) => ({
	id: 'v-s-pudra',
	sku: 'OLIVIA-S-PUDRA',
	size: 'S',
	color: 'Пудровий',
	colorHex: '#e8c9c9',
	price: 264_900,
	stock: 5,
	...patch
});

const product: ProductDetail = {
	id: 'p1',
	slug: 'suknia-olivia',
	name: 'Сатинова сукня Olivia',
	description: 'Сатин зі шляхетним блиском.',
	price: 264_900,
	compareAt: null,
	category: { slug: 'sukni', name: 'Сукні' },
	images: [{ url: 'https://example.test/1.jpg', alt: 'фото', color: null }],
	attributes: [],
	variants: [
		variant({}),
		variant({ id: 'v-m-pudra', size: 'M', stock: 2 }),
		variant({ id: 'v-l-pudra', size: 'L', stock: 0 }),
		variant({ id: 'v-s-zelen', color: 'Зелений', colorHex: '#14532d', stock: 0 })
	]
};

/**
 * Головна кнопка. Саме `getAll…[0]`: таку саму назву носить кнопка в панелі
 * знизу, і вона теж лежить у DOM — але в розмітці йде після основної.
 */
const buy = () => screen.getAllByRole('button', { name: /Оберіть розмір|Додати в кошик|Немає/ })[0];

/** Панель швидкої купівлі знизу. Її немає в розмітці, поки вона не потрібна. */
const bar = () => document.querySelector('[data-slot="buy-bar"]');

/**
 * jsdom не має верстки, тож IntersectionObserver із setup нікого не сповіщає.
 * Тут потрібен керований: тест сам вирішує, коли кнопка пішла з екрана.
 */
let notify: (visible: boolean) => void;

beforeEach(() => {
	globalThis.IntersectionObserver = class {
		constructor(callback: IntersectionObserverCallback) {
			notify = (visible) =>
				callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as never);
		}
		observe() {}
		unobserve() {}
		disconnect() {}
		takeRecords() {
			return [];
		}
	} as unknown as typeof IntersectionObserver;
});

/** Прокрутити так, щоб основна кнопка зникла з екрана. */
async function scrollPastButton() {
	notify(false);
	await tick();
}

describe('форма купівлі', () => {
	it('до вибору розміру купити не можна', () => {
		render(AddToCartForm, { product });

		expect(buy()).toBeDisabled();
		expect(buy()).toHaveTextContent('Оберіть розмір');
		expect(document.querySelector('input[name="variantId"]')).toHaveValue('');
	});

	it('після вибору розміру у форму лягає id варіанта', async () => {
		render(AddToCartForm, { product });

		await fireEvent.click(screen.getByRole('button', { name: 'S' }));

		expect(document.querySelector('input[name="variantId"]')).toHaveValue('v-s-pudra');
		expect(buy()).toBeEnabled();
		expect(buy()).toHaveTextContent('Додати в кошик');
	});

	it('розмір без залишку вибрати не можна', () => {
		render(AddToCartForm, { product });
		expect(screen.getByRole('button', { name: 'L' })).toBeDisabled();
	});

	it('попереджає, коли лишилось мало', async () => {
		render(AddToCartForm, { product });

		await fireEvent.click(screen.getByRole('button', { name: 'M' }));
		expect(screen.getByText(/Залишилось 2 шт/)).toBeInTheDocument();
	});

	it('зміна кольору скидає розмір, якого в ньому немає', async () => {
		render(AddToCartForm, { product });

		await fireEvent.click(screen.getByRole('button', { name: 'S' }));
		expect(document.querySelector('input[name="variantId"]')).toHaveValue('v-s-pudra');

		await fireEvent.click(screen.getByRole('button', { name: 'Зелений' }));

		// у зеленому S немає — вибір скинуто, купити знову не можна
		expect(document.querySelector('input[name="variantId"]')).toHaveValue('');
		expect(buy()).toBeDisabled();
	});

	it('коли розібрали все — кнопка каже про це прямо', () => {
		render(AddToCartForm, {
			product: {
				...product,
				variants: product.variants.map((item) => ({ ...item, stock: 0 }))
			}
		});

		expect(buy()).toHaveTextContent('Немає в наявності');
		expect(buy()).toBeDisabled();
	});

	it('розпродана модель приходить без варіантів і пояснює це', () => {
		// Саме так її віддає сервер: розміри без залишку відсіюються в запиті.
		render(AddToCartForm, { product: { ...product, variants: [] } });

		expect(screen.getByText(/Усі розміри розібрали/)).toBeInTheDocument();
		expect(buy()).toHaveTextContent('Немає в наявності');
		expect(buy()).toBeDisabled();
	});

	it('показує знижку від старої ціни', () => {
		render(AddToCartForm, { product: { ...product, compareAt: 330_000 } });
		expect(screen.getByText('−20%')).toBeInTheDocument();
	});

	it('назва з розмітки лишається текстом, а не стає HTML', () => {
		const attack = '<img src=x onerror="alert(1)">';
		render(AddToCartForm, { product: { ...product, name: attack } });

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(attack);
		expect(document.querySelector('img[src="x"]')).toBeNull();
	});

	it('строк повернення береться з config, а не з тексту', () => {
		render(AddToCartForm, { product });

		expect(screen.getByText(`Повернення протягом ${RETURN_DAYS} днів`)).toBeInTheDocument();
	});

	it('ціни доставки в панелі немає — її рахує перевізник', () => {
		render(AddToCartForm, { product });

		expect(screen.getByText(/за тарифами перевізника/)).toBeInTheDocument();
	});

	it('дату отримання показує ту, що порахував сервер', () => {
		render(AddToCartForm, {
			product,
			delivery: [
				{
					value: 'NOVA_POSHTA_BRANCH',
					label: 'Нова Пошта — відділення',
					cost: 9000,
					shipsToday: true,
					eta: '10–12 вересня'
				}
			]
		});

		expect(screen.getByText('Отримаєте 10–12 вересня')).toBeInTheDocument();
	});
});

describe('панель купівлі знизу', () => {
	it('поки кнопка на екрані — панелі немає', () => {
		render(AddToCartForm, { product });

		expect(bar()).toBeNull();
	});

	it('кнопка пішла з екрана — панель виїжджає', async () => {
		render(AddToCartForm, { product });

		await scrollPastButton();

		expect(bar()).toBeInTheDocument();
	});

	it('без обраного розміру веде до вибору, а не в глухий кут', async () => {
		render(AddToCartForm, { product });
		await scrollPastButton();

		const quick = screen.getByRole('button', { name: 'Обрати розмір' });
		expect(quick).toBeEnabled();

		await fireEvent.click(quick);
		// Фокус переїхав на перший розмір, який реально є в наявності.
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'S' }));
	});

	it('з обраним розміром надсилає ту саму форму', async () => {
		render(AddToCartForm, { product });
		await fireEvent.click(screen.getByRole('button', { name: 'M' }));
		await scrollPastButton();

		const quick = screen.getAllByRole('button', { name: 'Додати в кошик' })[1];

		expect(quick).toHaveAttribute('type', 'submit');
		expect(quick.closest('form')).toBe(document.querySelector('form'));
	});

	it('розпродану модель панель не рекламує', async () => {
		render(AddToCartForm, {
			product: {
				...product,
				variants: product.variants.map((item) => ({ ...item, stock: 0 }))
			}
		});

		await scrollPastButton();

		expect(bar()).toBeNull();
	});
});
