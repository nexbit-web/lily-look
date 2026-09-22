import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Зміна статусу з кнопки.
 *
 * Кнопка приходить із повідомлення, яке могло висіти в чаті годину, тож
 * стан у ньому — не доказ. Перевіряємо саме це: перехід застосовується
 * тільки з того стану, який справді зараз у базі, і тільки тим, кому він
 * дозволений. Плюс журнал: без нього CRM не побачить, хто що зробив.
 */

const db = {
	order: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
	orderEvent: { create: vi.fn() },
	botNotice: { findMany: vi.fn(), upsert: vi.fn() },
	botUser: { findMany: vi.fn() }
};

const api = {
	sendMessage: vi.fn(),
	editMessage: vi.fn(),
	answerCallback: vi.fn(),
	callTelegram: vi.fn()
};

vi.mock('../db.js', () => ({ db }));
vi.mock('./api.js', () => api);

const { applyStatus, dispatchOrder } = await import('./orders.js');

const manager = {
	id: 'u1',
	telegramId: 777n,
	chatId: 777n,
	name: 'Олена',
	role: 'MANAGER' as const
};

const courier = { ...manager, id: 'u2', chatId: 888n, name: 'Ігор', role: 'COURIER' as const };

const card = (patch: Record<string, unknown> = {}) => ({
	id: 'o1',
	number: 'LL-ABC234',
	status: 'NEW',
	customerName: 'Марія',
	customerPhone: '+380671234567',
	customerEmail: null,
	deliveryMethod: 'NOVA_POSHTA_BRANCH',
	deliveryCity: 'Одеса',
	deliveryAddress: 'Відділення № 12',
	comment: '',
	subtotal: 264_900,
	deliveryCost: 0,
	total: 264_900,
	paymentProvider: 'manual',
	createdAt: new Date('2026-09-17T12:00:00Z'),
	items: [
		{
			variantId: 'v1',
			sku: 'SKU-1',
			productName: 'Сукня Olivia',
			productSlug: 'suknia-olivia',
			size: 'M',
			color: 'Чорний',
			imageUrl: null,
			unitPrice: 264_900,
			quantity: 1
		}
	],
	events: [],
	...patch
});

beforeEach(() => {
	for (const model of Object.values(db)) {
		for (const method of Object.values(model)) method.mockReset();
	}
	api.sendMessage.mockReset();
	api.editMessage.mockReset();

	db.order.updateMany.mockResolvedValue({ count: 1 });
	db.orderEvent.create.mockResolvedValue({});
	db.botNotice.findMany.mockResolvedValue([]);
	db.botNotice.upsert.mockResolvedValue({});
	db.botUser.findMany.mockResolvedValue([]);
	api.sendMessage.mockResolvedValue({ ok: true, result: { message_id: 5 } });
	api.editMessage.mockResolvedValue({ ok: true, result: {} });
});

describe('зміна статусу', () => {
	it('дозволений перехід застосовується й лишає слід у журналі', async () => {
		db.order.findUnique.mockResolvedValueOnce({ id: 'o1', status: 'NEW' }).mockResolvedValue(null);

		const outcome = await applyStatus('LL-ABC234', 'CONFIRMED', manager, null);

		expect(outcome).toEqual({ ok: true, status: 'CONFIRMED' });
		// Умова на поточний стан — те саме, що й у списанні залишків.
		expect(db.order.updateMany.mock.calls[0][0].where).toMatchObject({ status: 'NEW' });
		expect(db.orderEvent.create.mock.calls[0][0].data).toMatchObject({
			orderId: 'o1',
			status: 'CONFIRMED',
			actorId: 'u1'
		});
	});

	it('перестрибнути крок не вийде навіть підкинутою кнопкою', async () => {
		db.order.findUnique.mockResolvedValue({ id: 'o1', status: 'NEW' });

		const outcome = await applyStatus('LL-ABC234', 'DELIVERED', manager, null);

		expect(outcome).toMatchObject({ ok: false, why: 'forbidden' });
		expect(db.order.updateMany).not.toHaveBeenCalled();
	});

	it("кур'єр не може скасувати замовлення", async () => {
		db.order.findUnique.mockResolvedValue({ id: 'o1', status: 'SHIPPED' });

		const outcome = await applyStatus('LL-ABC234', 'CANCELLED', courier, null);

		expect(outcome).toMatchObject({ ok: false, why: 'forbidden' });
		expect(db.order.updateMany).not.toHaveBeenCalled();
	});

	it("кур'єр позначає отримання — це йому можна", async () => {
		db.order.findUnique
			.mockResolvedValueOnce({ id: 'o1', status: 'SHIPPED' })
			.mockResolvedValue(null);

		await expect(applyStatus('LL-ABC234', 'DELIVERED', courier, null)).resolves.toEqual({
			ok: true,
			status: 'DELIVERED'
		});
	});

	/**
	 * Двоє натиснули майже одночасно: перший уже перевів замовлення, і
	 * умовний запис другого нічого не змінює. Другий має отримати чесну
	 * відмову, а не мовчазне перетирання чужої дії.
	 */
	it('хтось устиг раніше — другий отримує відмову, а не перетирає', async () => {
		db.order.findUnique
			.mockResolvedValueOnce({ id: 'o1', status: 'NEW' })
			.mockResolvedValueOnce({ status: 'CONFIRMED' });
		db.order.updateMany.mockResolvedValue({ count: 0 });

		const outcome = await applyStatus('LL-ABC234', 'CONFIRMED', manager, null);

		expect(outcome).toEqual({ ok: false, why: 'stale', status: 'CONFIRMED' });
		expect(db.orderEvent.create).not.toHaveBeenCalled();
	});

	it('неіснуючого замовлення не вигадуємо', async () => {
		db.order.findUnique.mockResolvedValue(null);

		await expect(applyStatus('LL-NOPE', 'CONFIRMED', manager, null)).resolves.toEqual({
			ok: false,
			why: 'missing'
		});
	});

	/**
	 * Замовлення лежить у кількох чатах. Перемкнув один — у решти воно
	 * не має лишитись із кнопками від стану, якого вже немає.
	 */
	it('після зміни переписуються всі копії повідомлення', async () => {
		db.order.findUnique
			.mockResolvedValueOnce({ id: 'o1', status: 'NEW' })
			.mockResolvedValue(card({ status: 'CONFIRMED' }));
		db.botNotice.findMany.mockResolvedValue([
			{ chatId: 777n, messageId: 5n, botUser: { role: 'MANAGER' } },
			{ chatId: 888n, messageId: 9n, botUser: { role: 'COURIER' } }
		]);

		await applyStatus('LL-ABC234', 'CONFIRMED', manager, null);

		expect(api.editMessage).toHaveBeenCalledTimes(2);
		// Кур'єру в підтвердженому замовленні тиснути нічого.
		const courierKeyboard = api.editMessage.mock.calls[1][3];
		expect(courierKeyboard).toEqual([]);
	});
});

describe('розсилка нового замовлення', () => {
	it('кожному свої кнопки, і всі повідомлення запамʼятовуються', async () => {
		db.order.findUnique.mockResolvedValue(card());
		db.botUser.findMany.mockResolvedValue([manager, courier]);

		const sent = await dispatchOrder('LL-ABC234', null);

		expect(sent).toBe(2);
		// Менеджеру в новому замовленні — «Прийняти» і «Скасувати».
		expect(api.sendMessage.mock.calls[0][2].flat()).toHaveLength(2);
		// Кур'єру в новому замовленні — нічого.
		expect(api.sendMessage.mock.calls[1][2]).toEqual([]);
		expect(db.botNotice.upsert).toHaveBeenCalledTimes(2);
	});

	it('нікому не видано доступ — нічого не шлемо й не падаємо', async () => {
		db.order.findUnique.mockResolvedValue(card());
		db.botUser.findMany.mockResolvedValue([]);

		await expect(dispatchOrder('LL-ABC234', null)).resolves.toBe(0);
		expect(api.sendMessage).not.toHaveBeenCalled();
	});

	it('повідомлення не пішло — його не запамʼятовуємо', async () => {
		db.order.findUnique.mockResolvedValue(card());
		db.botUser.findMany.mockResolvedValue([manager]);
		api.sendMessage.mockResolvedValue({ ok: false, why: 'бот заблокований' });

		await expect(dispatchOrder('LL-ABC234', null)).resolves.toBe(0);
		expect(db.botNotice.upsert).not.toHaveBeenCalled();
	});
});
