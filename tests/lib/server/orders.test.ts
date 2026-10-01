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
const lineForVariant = vi.fn();
const dispatchOrder = vi.fn();

const tx = {
	productVariant: { updateMany: vi.fn() },
	order: { create: vi.fn(), findFirst: vi.fn() },
	wheelSpin: { findFirst: vi.fn(), updateMany: vi.fn() }
};

const db = {
	$transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
	order: { update: vi.fn() }
};

vi.mock('$lib/server/cart', () => ({ readCart, clearCart, lineForVariant }));
vi.mock('$lib/server/db', () => ({ db }));
vi.mock('$lib/server/bot/orders', () => ({ dispatchOrder }));

const { createOrder, createQuickOrder } = await import('$lib/server/orders');

/** Кука розіграшу колеса — є лише в тестах приза. */
let prizeCookie: string | undefined;
const cookies = {
	get: vi.fn((name: string) => (name === 'lily_prize' ? prizeCookie : undefined)),
	delete: vi.fn()
} as unknown as Cookies;

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
	comment: ''
};

beforeEach(() => {
	readCart.mockResolvedValue(cart);
	clearCart.mockResolvedValue(undefined);
	dispatchOrder.mockResolvedValue(0);
	tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
	tx.order.create.mockImplementation(async ({ data }) => ({
		id: 'order-1',
		number: 'LL-ABC234',
		total: data.total,
		prize: data.prize
	}));
	tx.wheelSpin.findFirst.mockReset();
	tx.order.findFirst.mockReset().mockResolvedValue(null);
	vi.mocked(cookies.delete).mockClear();
	tx.wheelSpin.updateMany.mockReset().mockResolvedValue({ count: 1 });
	prizeCookie = undefined;
	vi.mocked(cookies.delete).mockClear();
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
			where: { id: 'var-1', isActive: true, stock: { gte: 2 } },
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

	/**
	 * Доставку покупець платить перевізнику на пошті (або її оплачує магазин),
	 * тож у суму замовлення вона не входить: до сплати — рівно товари.
	 */
	it('сума замовлення — товари з кошика, без вигаданої ціни доставки', async () => {
		await createOrder(cookies, input);

		const data = tx.order.create.mock.calls[0][0].data;
		expect(data).toMatchObject({ subtotal: 319_800, deliveryCost: 0, total: 319_800 });
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
		expect(dispatchOrder).toHaveBeenCalledWith('LL-ABC234', null);
		expect(clearCart).toHaveBeenCalledWith(cookies);
	});

	it('повертає, що купили, — для реклами, без особистого', async () => {
		const result = await createOrder(cookies, input);

		expect(result).toMatchObject({
			ok: true,
			items: [{ slug: 'suknia-olivia', name: 'Сукня Olivia', unitPrice: 159_900, quantity: 2 }]
		});
	});

	it('усе списання й створення — в одній транзакції', async () => {
		await createOrder(cookies, input);
		expect(db.$transaction).toHaveBeenCalledTimes(1);
	});
});

/**
 * Що саме бачить менеджер, перевіряється там, де картка й складається
 * (`./bot/orders`). Тут — лише те, що замовлення до розсилки доходить і
 * що покупець від неї ніяк не залежить.
 */
describe('розсилка менеджерам', () => {
	it('передає номер і адресу сайту — з неї збереться посилання', async () => {
		await createOrder(cookies, input, 'https://lilylook.store');

		expect(dispatchOrder).toHaveBeenCalledWith('LL-ABC234', 'https://lilylook.store');
	});

	it('без адреси сайту розсилка все одно йде', async () => {
		await createOrder(cookies, input);

		expect(dispatchOrder).toHaveBeenCalledWith('LL-ABC234', null);
	});

	it('покупця не тримаємо, поки відповідає Telegram', async () => {
		// Розсилка, яка ніколи не доїде: замовлення має завершитись однаково.
		dispatchOrder.mockReturnValue(new Promise(() => {}));

		const result = await createOrder(cookies, input);

		expect(result).toMatchObject({ ok: true });
		expect(clearCart).toHaveBeenCalledWith(cookies);
	});

	it('Telegram зламався — замовлення все одно створене', async () => {
		// Модуль гасить помилки в себе, але навіть якщо колись перестане —
		// замовлення важливіше за повідомлення.
		dispatchOrder.mockRejectedValue(new Error('telegram down'));

		const result = await createOrder(cookies, input);

		expect(result).toMatchObject({ ok: true, number: 'LL-ABC234' });
	});
});

describe('createQuickOrder — «Купити в 1 клік»', () => {
	const contact = { customerName: 'Олена', customerPhone: '+380671234567' };

	beforeEach(() => {
		lineForVariant.mockResolvedValue({ ...line, quantity: 1, lineTotal: 159_900 });
		clearCart.mockClear();
		tx.order.create.mockClear();
		tx.productVariant.updateMany.mockClear();
	});

	it('одна річ, ім’я й телефон — замовлення без адреси, яку уточнить менеджер', async () => {
		const result = await createQuickOrder(cookies, 'var-1', contact);

		expect(result).toMatchObject({ ok: true, number: 'LL-ABC234' });
		const data = tx.order.create.mock.calls[0][0].data;
		expect(data).toMatchObject({
			customerName: 'Олена',
			customerPhone: '+380671234567',
			customerEmail: null,
			deliveryMethod: 'NOVA_POSHTA_BRANCH',
			deliveryCity: null,
			deliveryAddress: null,
			subtotal: 159_900,
			total: 159_900
		});
		expect(data.items.create).toHaveLength(1);
		expect(data.items.create[0]).toMatchObject({ variantId: 'var-1', quantity: 1 });
	});

	it('залишок списується тим самим атомарним способом, що й з кошика', async () => {
		await createQuickOrder(cookies, 'var-1', contact);

		expect(tx.productVariant.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'var-1', isActive: true, stock: { gte: 1 } },
				data: { stock: { decrement: 1 } }
			})
		);
	});

	it('менеджери отримують замовлення, а кошик покупця лишається як був', async () => {
		await createQuickOrder(cookies, 'var-1', contact, 'https://lilylook.store');

		expect(dispatchOrder).toHaveBeenCalledWith('LL-ABC234', 'https://lilylook.store');
		expect(clearCart).not.toHaveBeenCalled();
	});

	it('розмір розібрали чи вимкнули — зрозуміла відмова, без замовлення', async () => {
		lineForVariant.mockResolvedValue(null);

		const result = await createQuickOrder(cookies, 'var-1', contact);

		expect(result).toEqual({ ok: false, message: 'Цього розміру вже немає в наявності.' });
		expect(tx.order.create).not.toHaveBeenCalled();
	});

	it('останню річ щойно забрав інший покупець — відмова, замовлення не створене', async () => {
		tx.productVariant.updateMany.mockResolvedValueOnce({ count: 0 });

		const result = await createQuickOrder(cookies, 'var-1', contact);

		expect(result).toMatchObject({ ok: false });
		expect(tx.order.create).not.toHaveBeenCalled();
	});
});

describe('приз колеса фортуни', () => {
	const later = () => new Date(Date.now() + 60 * 60 * 1000);

	it('без куки розіграшу — замовлення як завжди, приз у базі не шукаємо', async () => {
		await createOrder(cookies, input);

		expect(tx.wheelSpin.findFirst).not.toHaveBeenCalled();
		expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
			subtotal: 319_800,
			total: 319_800,
			prize: null,
			prizeDiscount: 0
		});
	});

	it('знижка 7% віднімається від суми й округлюється до гривні', async () => {
		prizeCookie = 'spin-1';
		tx.wheelSpin.findFirst.mockResolvedValue({ prize: 'off7', expiresAt: later() });

		const result = await createOrder(cookies, input);

		// 7% від 3 198 грн — 223,86 → 224 грн
		expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
			subtotal: 319_800,
			prizeDiscount: 22_400,
			total: 297_400,
			prize: 'Знижка 7%'
		});
		expect(result).toMatchObject({ ok: true, prize: 'Знижка 7%' });
	});

	it('приз забирається один раз — умовою «ще не використаний» у тій самій транзакції', async () => {
		prizeCookie = 'spin-1';
		tx.wheelSpin.findFirst.mockResolvedValue({ prize: 'off3', expiresAt: later() });

		await createOrder(cookies, input);

		expect(tx.wheelSpin.updateMany).toHaveBeenCalledWith({
			where: { id: 'spin-1', usedAt: null },
			data: { usedAt: expect.any(Date), orderNumber: expect.stringMatching(/^LL-/) }
		});
		// Смужка з таймером має зникнути.
		expect(cookies.delete).toHaveBeenCalledWith('lily_prize', { path: '/' });
	});

	it('безкоштовна доставка — позначкою в замовленні, сума не змінюється', async () => {
		prizeCookie = 'spin-1';
		tx.wheelSpin.findFirst.mockResolvedValue({ prize: 'delivery', expiresAt: later() });

		await createOrder(cookies, input);

		expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
			total: 319_800,
			prize: 'Безкоштовна доставка',
			prizeDiscount: 0,
			prizeFreeDelivery: true
		});
	});

	it('невідомий код приза в замовлення не потрапляє й розіграш не витрачає', async () => {
		prizeCookie = 'spin-1';
		tx.wheelSpin.findFirst.mockResolvedValue({ prize: 'off0', expiresAt: later() });

		await createOrder(cookies, input);

		expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
			total: 319_800,
			prize: null,
			prizeFreeDelivery: false
		});
		expect(tx.wheelSpin.updateMany).not.toHaveBeenCalled();
	});

	it('приз прострочений чи вже використаний — замовлення без приза, а не відмова', async () => {
		prizeCookie = 'spin-1';
		tx.wheelSpin.findFirst.mockResolvedValue(null);

		const result = await createOrder(cookies, input);

		expect(result).toMatchObject({ ok: true, prize: null });
		expect(tx.order.create.mock.calls[0][0].data).toMatchObject({ total: 319_800, prize: null });
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('два замовлення одночасно — приз дістається лише одному', async () => {
		prizeCookie = 'spin-1';
		tx.wheelSpin.findFirst.mockResolvedValue({ prize: 'off7', expiresAt: later() });
		tx.wheelSpin.updateMany.mockResolvedValue({ count: 0 });

		await createOrder(cookies, input);

		expect(tx.order.create.mock.calls[0][0].data).toMatchObject({ total: 319_800, prize: null });
	});

	it('«Купити в 1 клік» теж отримує приз', async () => {
		lineForVariant.mockResolvedValue({ ...line, quantity: 1, lineTotal: 159_900 });
		prizeCookie = 'spin-1';
		tx.wheelSpin.findFirst.mockResolvedValue({ prize: 'off5', expiresAt: later() });

		await createQuickOrder(cookies, 'var-1', {
			customerName: 'Олена',
			customerPhone: '+380671234567'
		});

		// 5% від 1 599 грн — 79,95 → 80 грн
		expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
			prizeDiscount: 8_000,
			total: 151_900,
			prize: 'Знижка 5%'
		});
		expect(cookies.delete).toHaveBeenCalledWith('lily_prize', { path: '/' });
	});

	it('подарунок — один на номер: почистив куки й покрутив знову — знижки не буде', async () => {
		prizeCookie = 'spin-2';
		tx.wheelSpin.findFirst.mockResolvedValue({ prize: 'off10', expiresAt: later() });
		tx.order.findFirst.mockResolvedValue({ id: 'old-order' });

		const result = await createOrder(cookies, input);

		expect(tx.order.findFirst).toHaveBeenCalledWith({
			where: {
				customerPhone: '+380671234567',
				prize: { not: null },
				status: { not: 'CANCELLED' }
			},
			select: { id: true }
		});
		// Замовлення не створене (транзакція відкотиться разом із позначкою
		// «приз використано»), покупець бачить, чому.
		expect(result).toMatchObject({ ok: false, prizeTaken: true });
		expect(tx.order.create).not.toHaveBeenCalled();
		expect(clearCart).not.toHaveBeenCalled();
		// Кука приза прибрана — наступне натискання оформить без знижки.
		expect(cookies.delete).toHaveBeenCalledWith('lily_prize', { path: '/' });
	});

	it('«Купити в 1 клік» — те саме правило одного подарунка на номер', async () => {
		lineForVariant.mockResolvedValue({ ...line, quantity: 1, lineTotal: 159_900 });
		prizeCookie = 'spin-2';
		tx.wheelSpin.findFirst.mockResolvedValue({ prize: 'delivery', expiresAt: later() });
		tx.order.findFirst.mockResolvedValue({ id: 'old-order' });

		const result = await createQuickOrder(cookies, 'var-1', {
			customerName: 'Олена',
			customerPhone: '+380671234567'
		});

		expect(result).toMatchObject({ ok: false, prizeTaken: true });
		expect(tx.order.create).not.toHaveBeenCalled();
		expect(cookies.delete).toHaveBeenCalledWith('lily_prize', { path: '/' });
	});

	it('без приза номер не перевіряємо — звичайне замовлення не гальмує', async () => {
		await createOrder(cookies, input);

		expect(tx.order.findFirst).not.toHaveBeenCalled();
		expect(tx.order.create).toHaveBeenCalled();
	});
});
