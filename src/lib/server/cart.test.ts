import type { Cookies } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Кошик — місце, де перетинаються гроші й чужі дані, тож тут перевіряємо
 * три речі: ціни рахуються з БД, чужий кошик недосяжний, і на один
 * HTTP-запит іде один запит до бази.
 */

const db = {
	cart: { findUnique: vi.fn(), create: vi.fn() },
	cartItem: {
		count: vi.fn(),
		findUnique: vi.fn(),
		findFirst: vi.fn(),
		update: vi.fn(),
		create: vi.fn(),
		deleteMany: vi.fn()
	},
	productVariant: { findUnique: vi.fn() }
};

vi.mock('./db.js', () => ({ db }));

const { addToCart, clearCart, readCart, removeFromCart, setQuantity } = await import('./cart.js');

type SetCall = { name: string; value: string; options: Record<string, unknown> };

function makeCookies(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	const writes: SetCall[] = [];

	const cookies = {
		get: (name: string) => store.get(name),
		set: (name: string, value: string, options: Record<string, unknown>) => {
			store.set(name, value);
			writes.push({ name, value, options });
		},
		delete: (name: string) => store.delete(name)
	} as unknown as Cookies;

	return { cookies, writes };
}

const variant = (patch: Record<string, unknown> = {}) => ({
	id: 'var-1',
	size: 'M',
	color: 'Чорний',
	stock: 5,
	isActive: true,
	// finalPrice — те, що порахувала база з урахуванням знижок.
	finalPrice: null,
	product: {
		name: 'Сукня Olivia',
		slug: 'suknia-olivia',
		finalPrice: 100_000,
		isActive: true,
		images: [{ url: 'https://example.test/1.jpg', color: null }]
	},
	...patch
});

const item = (patch: Record<string, unknown> = {}) => ({
	id: 'item-1',
	quantity: 2,
	variant: variant(),
	...patch
});

function cartWith(items: unknown[]) {
	db.cart.findUnique.mockResolvedValue({ id: 'cart-1', items });
}

beforeEach(() => {
	db.cart.findUnique.mockReset();
	db.cart.create.mockReset();
	db.cartItem.count.mockReset();
	db.cartItem.findUnique.mockReset();
	db.cartItem.findFirst.mockReset();
	db.cartItem.update.mockReset();
	db.cartItem.create.mockReset();
	db.cartItem.deleteMany.mockReset();
	db.productVariant.findUnique.mockReset();
});

describe('readCart — ціни', () => {
	it('рахує суму з цін у базі, а не з чогось надісланого клієнтом', async () => {
		cartWith([item({ quantity: 3 })]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });

		const cart = await readCart(cookies);

		expect(cart.count).toBe(3);
		expect(cart.subtotal).toBe(300_000);
		expect(cart.lines[0].unitPrice).toBe(100_000);
	});

	it('ціна варіанта перебиває ціну товару', async () => {
		cartWith([item({ quantity: 1, variant: variant({ finalPrice: 79_900 }) })]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });

		const cart = await readCart(cookies);
		expect(cart.subtotal).toBe(79_900);
	});

	it('обрізає кількість до залишку на складі', async () => {
		cartWith([item({ quantity: 10, variant: variant({ stock: 2 }) })]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });

		const cart = await readCart(cookies);
		expect(cart.lines[0].quantity).toBe(2);
		expect(cart.subtotal).toBe(200_000);
	});

	it('викидає зняті з продажу товари, вимкнені розміри й нульові залишки', async () => {
		cartWith([
			item({ id: 'a', variant: variant({ product: { ...variant().product, isActive: false } }) }),
			item({ id: 'b', variant: variant({ stock: 0 }) }),
			// Розмір вимкнули в CRM — позиція теж має зникнути з кошика.
			item({ id: 'd', variant: variant({ isActive: false }) }),
			item({ id: 'c' })
		]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });

		const cart = await readCart(cookies);
		expect(cart.lines.map((line) => line.id)).toEqual(['c']);
	});

	it('без куки не ходить у базу зовсім', async () => {
		const { cookies } = makeCookies();
		const cart = await readCart(cookies);

		expect(cart.lines).toEqual([]);
		expect(db.cart.findUnique).not.toHaveBeenCalled();
	});

	it('переживає зниклий кошик (база чистилась, кука лишилась)', async () => {
		db.cart.findUnique.mockResolvedValue(null);
		const { cookies } = makeCookies({ lily_cart: 'ghost' });

		await expect(readCart(cookies)).resolves.toMatchObject({ lines: [], subtotal: 0 });
	});
});

/**
 * Фото позиції має відповідати обраному кольору. Інакше покупець додає
 * білу сорочку, а в кошику бачить чорну — і не вірить, що додалось те.
 */
describe('readCart — фото кольору', () => {
	const withPhotos = (images: { url: string; color: string | null }[], color = 'Білий') =>
		cartWith([
			item({
				variant: variant({
					color,
					product: {
						name: 'Сорочка',
						slug: 'sorochka',
						finalPrice: 100_000,
						isActive: true,
						images
					}
				})
			})
		]);

	it('бере кадр обраного кольору, а не перший', async () => {
		withPhotos([
			{ url: 'https://example.test/black.jpg', color: 'Чорний' },
			{ url: 'https://example.test/white.jpg', color: 'Білий' }
		]);

		const cart = await readCart(makeCookies({ lily_cart: 'cart-1' }).cookies);
		expect(cart.lines[0].imageUrl).toBe('https://example.test/white.jpg');
	});

	it('без власного кадру бере спільний', async () => {
		withPhotos([
			{ url: 'https://example.test/black.jpg', color: 'Чорний' },
			{ url: 'https://example.test/shared.jpg', color: null }
		]);

		const cart = await readCart(makeCookies({ lily_cart: 'cart-1' }).cookies);
		expect(cart.lines[0].imageUrl).toBe('https://example.test/shared.jpg');
	});

	it('коли кольори не розмічені — перше фото товару', async () => {
		withPhotos([{ url: 'https://example.test/black.jpg', color: 'Чорний' }]);

		const cart = await readCart(makeCookies({ lily_cart: 'cart-1' }).cookies);
		expect(cart.lines[0].imageUrl).toBe('https://example.test/black.jpg');
	});

	it('товар без фото не ламає кошик', async () => {
		withPhotos([]);

		const cart = await readCart(makeCookies({ lily_cart: 'cart-1' }).cookies);
		expect(cart.lines[0].imageUrl).toBeNull();
	});
});

describe('readCart — кеш на час запиту', () => {
	it('layout і сторінка разом дають один запит до БД', async () => {
		cartWith([item()]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });

		await Promise.all([readCart(cookies), readCart(cookies)]);
		await readCart(cookies);

		expect(db.cart.findUnique).toHaveBeenCalledTimes(1);
	});

	it('різні запити не бачать кеш одне одного', async () => {
		cartWith([item()]);
		const first = makeCookies({ lily_cart: 'cart-1' });
		const second = makeCookies({ lily_cart: 'cart-1' });

		await readCart(first.cookies);
		await readCart(second.cookies);

		expect(db.cart.findUnique).toHaveBeenCalledTimes(2);
	});

	it('після зміни кількості кеш віддає вже новий кошик, а не старий', async () => {
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.cart.findUnique
			.mockResolvedValueOnce({ id: 'cart-1', items: [item({ quantity: 2 })] })
			.mockResolvedValue({ id: 'cart-1', items: [item({ quantity: 3 })] });
		db.cartItem.findFirst.mockResolvedValue({ id: 'item-1', variant: { stock: 5 } });
		db.cartItem.update.mockResolvedValue({});

		await expect(readCart(cookies)).resolves.toMatchObject({ count: 2 });
		await setQuantity(cookies, 'item-1', 3);

		// load після мутації бачить свіжі дані…
		await expect(readCart(cookies)).resolves.toMatchObject({ count: 3 });
		// …і не платить за це зайвим запитом: перечитали рівно один раз
		expect(db.cart.findUnique).toHaveBeenCalledTimes(2);
	});

	it('після видалення й очищення кеш теж скидається', async () => {
		cartWith([item()]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.cartItem.deleteMany.mockResolvedValue({ count: 1 });

		await readCart(cookies);
		await removeFromCart(cookies, 'item-1');
		await clearCart(cookies);
		await readCart(cookies);

		expect(db.cart.findUnique).toHaveBeenCalledTimes(3);
	});
});

describe('setQuantity — чужий кошик', () => {
	it('шукає позицію тільки в межах свого кошика', async () => {
		cartWith([item()]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.cartItem.findFirst.mockResolvedValue({ id: 'item-1', variant: { stock: 5 } });
		db.cartItem.update.mockResolvedValue({});

		await setQuantity(cookies, 'item-1', 2);

		expect(db.cartItem.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'item-1', cartId: 'cart-1' } })
		);
	});

	it('не дає правити позицію без куки', async () => {
		const { cookies } = makeCookies();
		await expect(setQuantity(cookies, 'item-1', 5)).resolves.toEqual({
			ok: false,
			message: 'Кошик порожній.'
		});
		expect(db.cartItem.update).not.toHaveBeenCalled();
	});

	it('на чужий id відповідає «не знайдено» і нічого не пише', async () => {
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.cartItem.findFirst.mockResolvedValue(null);

		await expect(setQuantity(cookies, 'alien', 5)).resolves.toMatchObject({ ok: false });
		expect(db.cartItem.update).not.toHaveBeenCalled();
	});

	it('обрізає кількість до залишку й попереджає', async () => {
		cartWith([item({ quantity: 2, variant: variant({ stock: 2 }) })]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.cartItem.findFirst.mockResolvedValue({ id: 'item-1', variant: { stock: 2 } });
		db.cartItem.update.mockResolvedValue({});

		const result = await setQuantity(cookies, 'item-1', 99);

		expect(db.cartItem.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { quantity: 2 } })
		);
		expect(result).toMatchObject({ ok: false, message: expect.stringContaining('2') });
	});

	it('нуль означає видалення', async () => {
		cartWith([]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.cartItem.findFirst.mockResolvedValue({ id: 'item-1', variant: { stock: 5 } });
		db.cartItem.deleteMany.mockResolvedValue({ count: 1 });

		await setQuantity(cookies, 'item-1', 0);

		expect(db.cartItem.deleteMany).toHaveBeenCalledWith({
			where: { id: 'item-1', cartId: 'cart-1' }
		});
		expect(db.cartItem.update).not.toHaveBeenCalled();
	});
});

describe('removeFromCart', () => {
	it('видаляє тільки в межах свого кошика', async () => {
		cartWith([]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.cartItem.deleteMany.mockResolvedValue({ count: 1 });

		await removeFromCart(cookies, 'item-1');

		expect(db.cartItem.deleteMany).toHaveBeenCalledWith({
			where: { id: 'item-1', cartId: 'cart-1' }
		});
	});
});

describe('addToCart', () => {
	it('не додає знятий з продажу товар', async () => {
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.productVariant.findUnique.mockResolvedValue({
			id: 'var-1',
			isActive: true,
			stock: 5,
			product: { isActive: false }
		});

		await expect(addToCart(cookies, 'var-1')).resolves.toMatchObject({ ok: false });
		expect(db.cartItem.create).not.toHaveBeenCalled();
	});

	it('не додає розмір, вимкнений у CRM', async () => {
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.productVariant.findUnique.mockResolvedValue({
			id: 'var-1',
			isActive: false,
			stock: 5,
			product: { isActive: true }
		});

		await expect(addToCart(cookies, 'var-1')).resolves.toMatchObject({ ok: false });
		expect(db.cartItem.create).not.toHaveBeenCalled();
	});

	it('не додає товар без залишку', async () => {
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.productVariant.findUnique.mockResolvedValue({
			id: 'var-1',
			isActive: true,
			stock: 0,
			product: { isActive: true }
		});

		await expect(addToCart(cookies, 'var-1')).resolves.toMatchObject({ ok: false });
	});

	it('додає до вже наявної кількості й не перевищує залишок', async () => {
		cartWith([item()]);
		const { cookies } = makeCookies({ lily_cart: 'cart-1' });
		db.cart.findUnique.mockResolvedValue({ id: 'cart-1', items: [item()] });
		db.productVariant.findUnique.mockResolvedValue({
			id: 'var-1',
			isActive: true,
			stock: 3,
			product: { isActive: true }
		});
		db.cartItem.findUnique.mockResolvedValue({ id: 'item-1', quantity: 2 });
		db.cartItem.update.mockResolvedValue({});

		const result = await addToCart(cookies, 'var-1', 5);

		expect(db.cartItem.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { quantity: 3 } })
		);
		expect(result).toMatchObject({ ok: false, message: expect.stringContaining('3') });
	});

	it('новому покупцю заводить кошик і кладе куку httpOnly', async () => {
		const { cookies, writes } = makeCookies();
		db.productVariant.findUnique.mockResolvedValue({
			id: 'var-1',
			isActive: true,
			stock: 5,
			product: { isActive: true }
		});
		db.cart.create.mockResolvedValue({ id: 'cart-new' });
		db.cartItem.findUnique.mockResolvedValue(null);
		db.cartItem.create.mockResolvedValue({});
		db.cart.findUnique.mockResolvedValue({ id: 'cart-new', items: [item()] });

		await addToCart(cookies, 'var-1');

		expect(writes).toHaveLength(1);
		expect(writes[0]).toMatchObject({
			name: 'lily_cart',
			value: 'cart-new',
			options: { httpOnly: true, sameSite: 'lax', path: '/' }
		});
	});
});
