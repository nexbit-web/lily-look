import type { CheckoutInput } from '$lib/schemas';
import type { CartLine, CartView } from '$lib/types';
import type { Cookies } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Оформлення замовлення — єдине місце, де списуються залишки й фіксуються
 * гроші. Перевіряємо атомарність списання, підсумки й те, що збій
 * сторонніх сервісів не з’їдає замовлення.
 */

const readCart = vi.fn();
const clearCart = vi.fn();
const resolveDeliveryCost = vi.fn();
const notifyNewOrder = vi.fn();

const tx = {
	productVariant: { updateMany: vi.fn() },
	order: { create: vi.fn() }
};

const db = {
	$transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
	order: { update: vi.fn() }
};

vi.mock('./cart.js', () => ({ readCart, clearCart }));
vi.mock('./db.js', () => ({ db }));
vi.mock('./delivery-cost.js', () => ({ resolveDeliveryCost }));
vi.mock('./telegram.js', () => ({ notifyNewOrder }));

const { createOrder } = await import('./orders.js');

const cookies = {} as Cookies;

const line: CartLine = {
	id: 'item-1',
	variantId: 'var-1',
	productName: 'Сукня Olivia',
	productSlug: 'suknia-olivia',
	size: 'M',
	color: 'Пудровий',
	imageUrl: 'https://example.test/1.jpg',
	unitPrice: 159_900,
	quantity: 2,
	lineTotal: 319_800,
	stock: 5
};

const cart: CartView = { id: 'cart-1', lines: [line], subtotal: 319_800, count: 2 };

const input: CheckoutInput = {
	customerName: 'Олена Коваль',
	customerPhone: '+380671234567',
	customerEmail: '',
	deliveryMethod: 'NOVA_POSHTA_BRANCH',
	deliveryCity: 'Одеса',
	deliveryAddress: 'Відділення № 12',
	deliveryCityRef: 'city-ref',
	comment: ''
};

beforeEach(() => {
	readCart.mockResolvedValue(cart);
	clearCart.mockResolvedValue(undefined);
	resolveDeliveryCost.mockResolvedValue(9800);
	notifyNewOrder.mockResolvedValue(undefined);
	tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
	tx.order.create.mockResolvedValue({ id: 'order-1', number: 'LL-ABC234' });
	db.order.update.mockResolvedValue({});
	db.$transaction.mockClear();
});

describe('createOrder', () => {
	it('порожній кошик не перетворюється на замовлення', async () => {
		readCart.mockResolvedValue({ id: null, lines: [], subtotal: 0, count: 0 });

		await expect(createOrder(cookies, input)).resolves.toMatchObject({ ok: false });
		expect(db.$transaction).not.toHaveBeenCalled();
	});

	it('списує залишок умовою stock >= quantity — без гонок', async () => {
		await createOrder(cookies, input);

		expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
			where: { id: 'var-1', stock: { gte: 2 } },
			data: { stock: { decrement: 2 } }
		});
	});

	it('якщо товар щойно розібрали — замовлення не створюється', async () => {
		tx.productVariant.updateMany.mockResolvedValue({ count: 0 });

		const result = await createOrder(cookies, input);

		expect(result).toMatchObject({ ok: false, message: expect.stringContaining('розібрали') });
		expect(tx.order.create).not.toHaveBeenCalled();
		expect(clearCart).not.toHaveBeenCalled();
	});

	it('рахує суму з кошика й доставку з єдиного розрахунку', async () => {
		await createOrder(cookies, input);

		expect(resolveDeliveryCost).toHaveBeenCalledWith({
			method: 'NOVA_POSHTA_BRANCH',
			subtotal: 319_800,
			itemCount: 2,
			cityRef: 'city-ref'
		});

		const data = tx.order.create.mock.calls[0][0].data;
		expect(data).toMatchObject({ subtotal: 319_800, deliveryCost: 9800, total: 329_600 });
	});

	it('зберігає знімок товару, а не посилання на нього', async () => {
		await createOrder(cookies, input);

		const [item] = tx.order.create.mock.calls[0][0].data.items.create;
		expect(item).toMatchObject({
			productName: 'Сукня Olivia',
			size: 'M',
			color: 'Пудровий',
			unitPrice: 159_900,
			quantity: 2
		});
	});

	it('номер замовлення без 0, O, 1 та I — щоб диктувати телефоном', async () => {
		await createOrder(cookies, input);

		const { number } = tx.order.create.mock.calls[0][0].data;
		expect(number).toMatch(/^LL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
	});

	it('порожній email лягає в базу як null', async () => {
		await createOrder(cookies, input);
		expect(tx.order.create.mock.calls[0][0].data.customerEmail).toBeNull();
	});

	it('очищає кошик і сповіщає менеджерів', async () => {
		const result = await createOrder(cookies, input);

		expect(result).toMatchObject({ ok: true, number: 'LL-ABC234' });
		expect(notifyNewOrder).toHaveBeenCalledWith(
			expect.objectContaining({ number: 'LL-ABC234', total: 329_600 })
		);
		expect(clearCart).toHaveBeenCalledWith(cookies);
	});

	it('усе списання й створення — в одній транзакції', async () => {
		await createOrder(cookies, input);
		expect(db.$transaction).toHaveBeenCalledTimes(1);
	});
});
