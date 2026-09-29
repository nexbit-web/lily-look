import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Межа «браузер → сервер» на сторінці товару. Форму видно в DOM і її можна
 * підробити повністю, тому action зобовʼязаний перевірити все сам —
 * особливо кількість: відʼємна лягла б у кошик як є й пустила б суму
 * замовлення в мінус.
 */

const addToCart = vi.fn();

const track = vi.fn();
const visitor = { id: 'abc123def456ghi789jk', source: 'facebook', device: 'mobile' };

const metaAddToCart = vi.fn();
const metaPurchase = vi.fn();
const createQuickOrder = vi.fn();

vi.mock('$lib/server/cart', () => ({ addToCart }));
vi.mock('$lib/server/meta', () => ({ metaAddToCart, metaPurchase }));
vi.mock('$lib/server/orders', () => ({ createQuickOrder }));
vi.mock('$lib/server/analytics', () => ({ identify: () => visitor, track }));
vi.mock('$lib/server/catalog', () => ({ getProduct: vi.fn(), listRecommended: vi.fn() }));

const { actions } = await import('$routes/product/[slug]/+page.server');

function event(fields: Record<string, string>) {
	return {
		request: new Request('http://localhost/product/suknia-olivia', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(fields)
		}),
		cookies: {} as RequestEvent['cookies'],
		url: new URL('http://localhost/product/suknia-olivia?/add')
	} as RequestEvent;
}

const add = (fields: Record<string, string>) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions.add as any)(event(fields));

const quick = (fields: Record<string, string>) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions.quick as any)(event(fields));

beforeEach(() => {
	track.mockReset();
	metaAddToCart.mockReset();
	addToCart.mockResolvedValue({ ok: true, cart: { lines: [], subtotal: 0, count: 0 } });
});

describe('action add', () => {
	it('без кількості додає одну річ — саме так надсилає сторінка', async () => {
		await expect(add({ variantId: 'v-1' })).resolves.toEqual({ added: true });
		expect(addToCart).toHaveBeenCalledWith(expect.anything(), 'v-1', 1);
	});

	it('явна кількість доходить до кошика', async () => {
		await add({ variantId: 'v-1', quantity: '3' });
		expect(addToCart).toHaveBeenCalledWith(expect.anything(), 'v-1', 3);
	});

	it('без розміру просить його обрати', async () => {
		const result = await add({});

		expect(result).toMatchObject({ status: 400, data: { message: 'Оберіть колір і розмір.' } });
		expect(addToCart).not.toHaveBeenCalled();
	});

	it.each([
		['відʼємна кількість', { variantId: 'v-1', quantity: '-3' }],
		['дробова кількість', { variantId: 'v-1', quantity: '1.5' }],
		['нуль', { variantId: 'v-1', quantity: '0' }],
		['нечисло', { variantId: 'v-1', quantity: 'багато' }],
		['порожній рядок', { variantId: 'v-1', quantity: '' }],
		['нескінченність', { variantId: 'v-1', quantity: 'Infinity' }],
		['експонента', { variantId: 'v-1', quantity: '1e3' }],
		['понад стелю', { variantId: 'v-1', quantity: '100' }]
	])('відбиває %s', async (_case, fields) => {
		const result = await add(fields);

		expect(result).toMatchObject({ status: 400 });
		expect(addToCart).not.toHaveBeenCalled();
	});

	it('повідомлення від кошика доходить до форми як помилка', async () => {
		addToCart.mockResolvedValue({ ok: false, message: 'Доступно лише 2 шт. цього розміру.' });

		const result = await add({ variantId: 'v-1' });
		expect(result).toMatchObject({
			status: 400,
			data: { message: 'Доступно лише 2 шт. цього розміру.' }
		});
	});
});

describe('відвідуваність', () => {
	it('поклав у кошик — крок воронки записаний на цю сторінку', async () => {
		await add({ variantId: 'v-1' });

		expect(track).toHaveBeenCalledWith(visitor, 'add_to_cart', '/product/suknia-olivia');
	});

	it('не вийшло (немає розміру) — нічого не записується', async () => {
		await add({ quantity: '1' });

		expect(track).not.toHaveBeenCalled();
		expect(metaAddToCart).not.toHaveBeenCalled();
	});

	it('реклама Meta дізнається, що саме й за скільки поклали', async () => {
		addToCart.mockResolvedValue({
			ok: true,
			cart: {
				lines: [
					{
						variantId: 'v-0',
						productSlug: 'insha',
						productName: 'Інша',
						unitPrice: 100,
						quantity: 1
					},
					{
						variantId: 'v-1',
						productSlug: 'suknia-olivia',
						productName: 'Сукня Olivia',
						unitPrice: 189900,
						quantity: 3
					}
				],
				subtotal: 0,
				count: 4
			}
		});

		await add({ variantId: 'v-1', quantity: '2' });

		// Кількість — саме додана зараз, а не вся, що вже лежить у кошику.
		expect(metaAddToCart).toHaveBeenCalledWith(expect.anything(), visitor, {
			slug: 'suknia-olivia',
			name: 'Сукня Olivia',
			unitPrice: 189900,
			quantity: 2
		});
	});
});

describe('action quick — «Купити в 1 клік»', () => {
	const valid = { variantId: 'v-1', customerName: 'Олена', customerPhone: '+380671234567' };
	const items = [{ slug: 'suknia-olivia', name: 'Сукня', unitPrice: 189_900, quantity: 1 }];

	beforeEach(() => {
		track.mockReset();
		metaPurchase.mockReset();
		createQuickOrder.mockReset();
		createQuickOrder.mockResolvedValue({ ok: true, number: 'LL-ABC234', redirectUrl: null, items });
	});

	it('ім’я, телефон і розмір — замовлення створене, покупець на його сторінці', async () => {
		await expect(quick(valid)).rejects.toMatchObject({
			status: 303,
			location: '/order/LL-ABC234'
		});
		expect(createQuickOrder).toHaveBeenCalledWith(
			'v-1',
			{ customerName: 'Олена', customerPhone: '+380671234567' },
			'http://localhost'
		);
	});

	it('замовлення рахується у воронці й іде в рекламу як покупка', async () => {
		await expect(quick(valid)).rejects.toMatchObject({ status: 303 });

		expect(track).toHaveBeenCalledWith(visitor, 'order', '/product/suknia-olivia');
		expect(metaPurchase).toHaveBeenCalledWith(
			expect.anything(),
			visitor,
			expect.objectContaining({ number: 'LL-ABC234', items }),
			expect.objectContaining({ customerName: 'Олена', customerPhone: '+380671234567' })
		);
	});

	it('без розміру — відмова, замовлення немає', async () => {
		const result = await quick({ ...valid, variantId: '' });

		expect(result).toMatchObject({
			status: 400,
			data: { quick: true, message: 'Оберіть розмір.' }
		});
		expect(createQuickOrder).not.toHaveBeenCalled();
	});

	it.each([
		['без імені', { customerName: '' }, 'customerName'],
		['кривий телефон', { customerPhone: '12345' }, 'customerPhone'],
		['телефон без коду країни', { customerPhone: '0671234567' }, 'customerPhone']
	])('%s — помилка біля поля, введене повертається', async (_case, patch, field) => {
		const result = await quick({ ...valid, ...patch });

		expect(result).toMatchObject({ status: 400, data: { quick: true } });
		expect(result.data.errors[field]).toBeTruthy();
		expect(result.data.values.customerName).toBe({ ...valid, ...patch }.customerName);
		expect(createQuickOrder).not.toHaveBeenCalled();
	});

	it('розмір розібрали — зрозуміле повідомлення, ні статистики, ні реклами', async () => {
		createQuickOrder.mockResolvedValue({
			ok: false,
			message: 'Цього розміру вже немає в наявності.'
		});

		const result = await quick(valid);

		expect(result).toMatchObject({
			status: 400,
			data: { quick: true, message: 'Цього розміру вже немає в наявності.' }
		});
		expect(track).not.toHaveBeenCalled();
		expect(metaPurchase).not.toHaveBeenCalled();
	});
});
