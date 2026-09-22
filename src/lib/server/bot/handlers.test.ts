import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Поведінка бота.
 *
 * Найважливіше тут — що чужий не дізнається нічого. Ні номерів, ні сум,
 * ні навіть того, чи існує таке замовлення: на будь-який дотик однакова
 * суха відповідь, і жодного запиту в базу замовлень.
 */

const access = { findActor: vi.fn(), redeemInvite: vi.fn() };
const api = { sendMessage: vi.fn(), answerCallback: vi.fn() };
const orders = {
	activeOrders: vi.fn(),
	applyStatus: vi.fn(),
	orderCard: vi.fn(),
	rememberNotice: vi.fn()
};

vi.mock('./access.js', () => access);
vi.mock('./api.js', () => api);
vi.mock('./orders.js', () => orders);

const { handleUpdate } = await import('./handlers.js');

const actor = {
	id: 'u1',
	telegramId: 777n,
	chatId: 777n,
	name: 'Олена',
	role: 'MANAGER' as const
};

const from = { id: 777, first_name: 'Олена', username: 'olena' };

const message = (text: string) => ({
	update_id: 1,
	message: { chat: { id: 777 }, from, text }
});

const press = (data: string) => ({
	update_id: 2,
	callback_query: { id: 'q1', data, from, message: { chat: { id: 777 } } }
});

/** Увесь текст, який бот надіслав за тест. */
const said = () => api.sendMessage.mock.calls.map((call) => String(call[1])).join('\n');

beforeEach(() => {
	for (const group of [access, api, orders]) {
		for (const fn of Object.values(group)) fn.mockReset();
	}
	api.sendMessage.mockResolvedValue({ ok: true, result: { message_id: 5 } });
	access.findActor.mockResolvedValue(actor);
	orders.activeOrders.mockResolvedValue([]);
});

describe('чужий не дізнається нічого', () => {
	it('команда від невідомого — сухе «доступу немає» й жодного запиту до замовлень', async () => {
		access.findActor.mockResolvedValue(null);

		await handleUpdate(message('/zamovlennia'), null);

		expect(said()).toContain('Доступу немає');
		expect(orders.activeOrders).not.toHaveBeenCalled();
	});

	/**
	 * Пошук за номером — найспокусливіший спосіб промацати магазин:
	 * різна відповідь на існуючий і неіснуючий номер уже видала б, які
	 * замовлення є.
	 */
	it('пошук за номером від невідомого не доходить до бази', async () => {
		access.findActor.mockResolvedValue(null);

		await handleUpdate(message('/z LL-ABC234'), null);

		expect(said()).toContain('Доступу немає');
		expect(orders.orderCard).not.toHaveBeenCalled();
	});

	it('натискання від невідомого не рухає замовлення', async () => {
		access.findActor.mockResolvedValue(null);

		await handleUpdate(press('o:LL-ABC234:CONFIRMED'), null);

		expect(orders.applyStatus).not.toHaveBeenCalled();
		expect(api.answerCallback).toHaveBeenCalledWith('q1', 'Доступу немає');
	});
});

describe('видача доступу', () => {
	it('код відкриває доступ', async () => {
		access.redeemInvite.mockResolvedValue({ ok: true, actor, returning: false });

		await handleUpdate(message('/start ABC123'), null);

		expect(access.redeemInvite.mock.calls[0][0]).toBe('ABC123');
		expect(access.redeemInvite.mock.calls[0][1]).toMatchObject({ telegramId: 777n, chatId: 777n });
		expect(said()).toContain('Доступ відкрито');
	});

	it('поганий код не підказує, чи він узагалі існував', async () => {
		access.redeemInvite.mockResolvedValue({ ok: false, why: 'unknown' });
		await handleUpdate(message('/start NOPE'), null);
		const unknown = said();

		api.sendMessage.mockClear();
		access.redeemInvite.mockResolvedValue({ ok: false, why: 'used' });
		await handleUpdate(message('/start USED'), null);

		expect(said()).toBe(unknown);
	});

	it('/start без коду від невідомого пояснює, що робити', async () => {
		access.findActor.mockResolvedValue(null);

		await handleUpdate(message('/start'), null);

		expect(said()).toContain('/start');
		expect(access.redeemInvite).not.toHaveBeenCalled();
	});
});

describe('кнопки', () => {
	it('успішний перехід підтверджується назвою нового стану', async () => {
		orders.applyStatus.mockResolvedValue({ ok: true, status: 'SHIPPED' });

		await handleUpdate(press('o:LL-ABC234:SHIPPED'), null);

		expect(orders.applyStatus).toHaveBeenCalledWith('LL-ABC234', 'SHIPPED', actor, null);
		expect(api.answerCallback).toHaveBeenCalledWith('q1', 'Відправлене');
	});

	it('хтось устиг раніше — так і кажемо', async () => {
		orders.applyStatus.mockResolvedValue({ ok: false, why: 'stale', status: 'CONFIRMED' });

		await handleUpdate(press('o:LL-ABC234:CONFIRMED'), null);

		expect(String(api.answerCallback.mock.calls[0][1])).toContain('змінив раніше');
	});

	it('підкинуті дані кнопки нічого не роблять', async () => {
		await handleUpdate(press('o:LL-ABC234:REFUNDED'), null);

		expect(orders.applyStatus).not.toHaveBeenCalled();
		expect(api.answerCallback).toHaveBeenCalledWith('q1', 'Невідома кнопка');
	});
});

describe('стійкість', () => {
	/**
	 * Вебхук мусить відповісти Telegram 200 навіть на зламаному апдейті:
	 * інакше той зациклиться й перестане присилати решту.
	 */
	it('помилка всередині не вилітає назовні', async () => {
		access.findActor.mockRejectedValue(new Error('база відвалилась'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(handleUpdate(message('/zamovlennia'), null)).resolves.toBeUndefined();
	});

	it('апдейт без тексту й без кнопки просто ігнорується', async () => {
		await handleUpdate({ update_id: 3 }, null);

		expect(api.sendMessage).not.toHaveBeenCalled();
	});
});
