import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Оформлення замовлення — межа, за якою гроші. Форму можна підробити як
 * завгодно, тому action перевіряє все сам і ніколи не створює замовлення
 * з кривих даних. А в разі відмови повертає введене — покупець не має
 * набирати все з нуля.
 */

const countCartItems = vi.fn();
const readCart = vi.fn();
const createOrder = vi.fn();

const track = vi.fn();
const visitor = { id: 'abc123def456ghi789jk', source: 'facebook', device: 'mobile' };

const metaPurchase = vi.fn();

vi.mock('$lib/server/cart', () => ({ countCartItems, readCart }));
vi.mock('$lib/server/meta', () => ({ metaPurchase }));
vi.mock('$lib/server/analytics', () => ({ identify: () => visitor, track }));
vi.mock('$lib/server/orders', () => ({ createOrder }));
vi.mock('$lib/server/nova-poshta', () => ({ isNovaPoshtaConfigured: () => true }));

const { actions, load } = await import('$routes/checkout/+page.server');

const valid = {
	customerName: 'Олена Коваль',
	customerPhone: '+380671234567',
	customerEmail: '',
	deliveryMethod: 'NOVA_POSHTA_BRANCH',
	deliveryCity: 'Київ',
	deliveryAddress: 'Відділення №1',
	comment: ''
};

function submit(fields: Record<string, string>) {
	const event = {
		request: new Request('https://lilylook.store/checkout', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(fields)
		}),
		cookies: {} as RequestEvent['cookies'],
		url: new URL('https://lilylook.store/checkout')
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (actions.default as any)(event);
}

const items = [{ slug: 'palto', name: 'Пальто', unitPrice: 264900, quantity: 1 }];

type Failure = {
	status: number;
	data: { errors?: Record<string, string>; message?: string; values: Record<string, string> };
};

beforeEach(() => {
	vi.clearAllMocks();
	createOrder.mockResolvedValue({ ok: true, number: 'LL-ABC234', redirectUrl: null, items });
});

describe('сторінка оформлення', () => {
	it('з порожнім кошиком — назад у кошик', async () => {
		countCartItems.mockResolvedValue(0);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect((load as any)({ cookies: {} })).rejects.toMatchObject({
			status: 303,
			location: '/cart'
		});
	});

	it('з товаром — форма й кошик', async () => {
		countCartItems.mockResolvedValue(2);
		readCart.mockResolvedValue({ lines: [], subtotal: 0, count: 2 });

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = await (load as any)({ cookies: {} });

		expect(data.novaPoshtaLive).toBe(true);
		await expect(data.cart).resolves.toMatchObject({ count: 2 });
	});
});

describe('замовлення', () => {
	it('усе заповнено — замовлення створене, покупець на сторінці замовлення', async () => {
		await expect(submit(valid)).rejects.toMatchObject({
			status: 303,
			location: '/order/LL-ABC234'
		});
		expect(createOrder).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ customerPhone: '+380671234567', deliveryCity: 'Київ' }),
			'https://lilylook.store'
		);
	});

	it('онлайн-оплата — на сторінку провайдера', async () => {
		createOrder.mockResolvedValue({
			ok: true,
			number: 'LL-ABC234',
			redirectUrl: 'https://pay.example/1'
		});

		await expect(submit(valid)).rejects.toMatchObject({ location: 'https://pay.example/1' });
	});

	it('самовивіз — адреса не потрібна', async () => {
		await expect(
			submit({ ...valid, deliveryMethod: 'PICKUP', deliveryCity: '', deliveryAddress: '' })
		).rejects.toMatchObject({ status: 303 });
	});

	it.each([
		['без імені', { customerName: '' }, 'customerName'],
		['телефон без +380', { customerPhone: '0671234567' }, 'customerPhone'],
		['телефон з літерами', { customerPhone: '+38067abc4567' }, 'customerPhone'],
		['кривий email', { customerEmail: 'olena@' }, 'customerEmail'],
		['вигаданий спосіб доставки', { deliveryMethod: 'teleport' }, 'deliveryMethod'],
		['коментар понад 500 символів', { comment: 'а'.repeat(501) }, 'comment']
	])('%s — відмова з помилкою під полем', async (_case, patch, field) => {
		const result = (await submit({ ...valid, ...patch })) as Failure;

		expect(result.status).toBe(400);
		expect(result.data.errors?.[field]).toBeTruthy();
		expect(createOrder).not.toHaveBeenCalled();
	});

	it('Нова Пошта без міста й відділення — відмова з обома помилками', async () => {
		const result = (await submit({ ...valid, deliveryCity: '', deliveryAddress: '  ' })) as Failure;

		expect(result.status).toBe(400);
		expect(Object.keys(result.data.errors ?? {})).toEqual(['deliveryCity', 'deliveryAddress']);
		expect(createOrder).not.toHaveBeenCalled();
	});

	it('відмова повертає все введене — поля не спорожніють', async () => {
		const result = (await submit({ ...valid, customerPhone: '123' })) as Failure;

		expect(result.data.values).toMatchObject({
			customerName: 'Олена Коваль',
			deliveryCity: 'Київ'
		});
	});

	it('товар розібрали, поки покупець заповнював форму, — зрозуміле повідомлення', async () => {
		createOrder.mockResolvedValue({ ok: false, message: '«Сукня» щойно розібрали.' });

		const result = (await submit(valid)) as Failure;

		expect(result.status).toBe(400);
		expect(result.data.message).toContain('розібрали');
		expect(result.data.values.customerName).toBe('Олена Коваль');
	});
});

describe('відвідуваність', () => {
	it('замовлення оформлене — останній крок воронки записаний', async () => {
		await expect(submit(valid)).rejects.toMatchObject({ status: 303 });

		expect(track).toHaveBeenCalledWith(visitor, 'order', '/checkout');
		expect(metaPurchase).toHaveBeenCalledWith(
			expect.anything(),
			visitor,
			expect.objectContaining({ number: 'LL-ABC234', items }),
			expect.objectContaining({ customerName: 'Олена Коваль', customerPhone: '+380671234567' })
		);
	});

	it('форму відбито чи товар розібрали — замовлення в статистиці немає', async () => {
		await submit({ ...valid, customerPhone: '1' });
		createOrder.mockResolvedValue({ ok: false, message: 'розібрали' });
		await submit(valid);

		expect(track).not.toHaveBeenCalled();
		expect(metaPurchase).not.toHaveBeenCalled();
	});
});
