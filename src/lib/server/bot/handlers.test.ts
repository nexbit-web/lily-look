import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Поведінка бота.
 *
 * Найважливіше тут — що чужий не дізнається нічого. Ні номерів, ні сум,
 * ні навіть того, чи існує таке замовлення: на будь-який дотик однакова
 * суха відповідь, і жодного запиту в базу замовлень.
 */

const access = {
	findActor: vi.fn(),
	redeemInvite: vi.fn(),
	createInvite: vi.fn(),
	listAccess: vi.fn(),
	setAccess: vi.fn()
};
const reports = { buildReport: vi.fn() };
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
vi.mock('./reports.js', () => reports);

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
	for (const group of [access, api, orders, reports]) {
		for (const fn of Object.values(group)) fn.mockReset();
	}
	api.sendMessage.mockResolvedValue({ ok: true, result: { message_id: 5 } });
	access.findActor.mockResolvedValue(actor);
	orders.activeOrders.mockResolvedValue([]);
	reports.buildReport.mockResolvedValue('<b>Звіт</b>');
	access.listAccess.mockResolvedValue([]);
	access.createInvite.mockResolvedValue('LILY-AAAAAA');
	access.setAccess.mockResolvedValue({ name: 'Ігор' });
});

const admin = { ...actor, role: 'ADMIN' as const };

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

describe('тільки особистий чат', () => {
	/**
	 * Найдорожча з можливих помилок: якби `/start` спрацював у групі,
	 * `chat.id` там — це група, доступ привʼязався б до неї, і всі
	 * замовлення магазину поїхали б у чат, де сидить хто завгодно.
	 */
	it('у групі бот мовчить і коду не гасить', async () => {
		const update = {
			update_id: 7,
			message: { chat: { id: -100123, type: 'supergroup' }, from, text: '/start LILY-AAAAAA' }
		};

		await handleUpdate(update, null);

		expect(access.redeemInvite).not.toHaveBeenCalled();
		expect(api.sendMessage).not.toHaveBeenCalled();
	});

	it('у групі не відповідає навіть своєму', async () => {
		const update = {
			update_id: 8,
			message: { chat: { id: -100123, type: 'group' }, from, text: '/zamovlennia' }
		};

		await handleUpdate(update, null);

		expect(orders.activeOrders).not.toHaveBeenCalled();
		expect(api.sendMessage).not.toHaveBeenCalled();
	});
});

describe('права власника', () => {
	it('звіт показується власнику', async () => {
		access.findActor.mockResolvedValue(admin);

		await handleUpdate(message('/zvit'), null);

		expect(reports.buildReport).toHaveBeenCalled();
		expect(said()).toContain('Звіт');
	});

	/**
	 * Менеджеру команда не просто забороняється, а й не згадується: відповідь
	 * «вам це недоступно» вже повідомляє, що звіт десь існує.
	 */
	it('менеджеру звіт не рахується й про нього не згадується', async () => {
		await handleUpdate(message('/zvit'), null);

		expect(reports.buildReport).not.toHaveBeenCalled();
		expect(said()).not.toContain('zvit');
		expect(said()).toContain('/zamovlennia');
	});

	it('менеджер не може ні видати код, ні закрити доступ', async () => {
		await handleUpdate(message('/kod ADMIN я головний'), null);
		await handleUpdate(message('/vymknuty 777'), null);

		expect(access.createInvite).not.toHaveBeenCalled();
		expect(access.setAccess).not.toHaveBeenCalled();
	});

	it('власник видає код із роллю', async () => {
		access.findActor.mockResolvedValue(admin);

		await handleUpdate(message('/kod COURIER Ігор на авто'), null);

		expect(access.createInvite).toHaveBeenCalledWith('COURIER', 'Ігор на авто');
		expect(said()).toContain('LILY-AAAAAA');
	});

	it('вигадана роль кода не створює', async () => {
		access.findActor.mockResolvedValue(admin);

		await handleUpdate(message('/kod BOSS хтось'), null);

		expect(access.createInvite).not.toHaveBeenCalled();
	});

	it('власник закриває доступ за id', async () => {
		access.findActor.mockResolvedValue(admin);

		await handleUpdate(message('/vymknuty 999'), null);

		expect(access.setAccess).toHaveBeenCalledWith(999n, false);
	});

	/**
	 * Інакше власник замикає сам себе назовні: відкрити доступ назад буде
	 * нікому, бо це вміє тільки власник.
	 */
	it('себе вимкнути не можна', async () => {
		access.findActor.mockResolvedValue(admin);

		await handleUpdate(message(`/vymknuty ${admin.telegramId}`), null);

		expect(access.setAccess).not.toHaveBeenCalled();
		expect(said()).toContain('Себе вимкнути не можна');
	});

	it('сміття замість id нічого не міняє', async () => {
		access.findActor.mockResolvedValue(admin);

		await handleUpdate(message('/vymknuty; DROP TABLE'), null);

		expect(access.setAccess).not.toHaveBeenCalled();
	});
});
