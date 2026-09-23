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
	setAccess: vi.fn(),
	leaveBot: vi.fn(),
	isLastAdmin: vi.fn()
};
const reports = { buildReport: vi.fn() };
const api = {
	sendMessage: vi.fn(),
	answerCallback: vi.fn(),
	setChatCommands: vi.fn(),
	clearChatCommands: vi.fn()
};
const orders = {
	activeOrders: vi.fn(),
	applyStatus: vi.fn(),
	orderCard: vi.fn(),
	rememberNotice: vi.fn()
};

vi.mock('$lib/server/bot/access', () => access);
vi.mock('$lib/server/bot/api', () => api);
vi.mock('$lib/server/bot/orders', () => orders);
vi.mock('$lib/server/bot/reports', () => reports);

const { handleUpdate } = await import('$lib/server/bot/handlers');

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
	access.leaveBot.mockResolvedValue(undefined);
	access.isLastAdmin.mockResolvedValue(false);
	api.setChatCommands.mockResolvedValue(undefined);
	api.clearChatCommands.mockResolvedValue(undefined);
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

	/**
	 * Картку до цієї миті вже перемальовано, тож відповідь має сказати не
	 * «не вийшло», а який стан насправді й що список кнопок оновлено.
	 */
	it('стан змінили повз картку — називаємо справжній і кажемо, що оновили', async () => {
		orders.applyStatus.mockResolvedValue({ ok: false, why: 'stale', status: 'SHIPPED' });

		await handleUpdate(press('o:LL-ABC234:CONFIRMED'), null);

		const said = String(api.answerCallback.mock.calls[0][1]);
		expect(said).toContain('відправлене');
		expect(said).toContain('оновлено');
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

describe('вихід із бота', () => {
	it('доступ знімається, меню команд прибирається', async () => {
		await handleUpdate(message('/vyity'), null);

		expect(access.leaveBot).toHaveBeenCalledWith(actor);
		expect(api.clearChatCommands).toHaveBeenCalledWith(actor.chatId);
		expect(said()).toContain('До зустрічі');
	});

	/** Головне, що має лишитись у голові: повернутись можна лише кодом. */
	it('пояснює, що повернутись можна тільки новим кодом', async () => {
		await handleUpdate(message('/vyity'), null);

		expect(said()).toContain('/start');
	});

	/**
	 * Найдорожча помилка в боті: останній адмін виходить і лишає
	 * магазин без того, хто видає коди. Звідси повертаються вже через базу.
	 */
	it('останнього власника перепитує, а не випускає одразу', async () => {
		access.findActor.mockResolvedValue(admin);
		access.isLastAdmin.mockResolvedValue(true);

		await handleUpdate(message('/vyity'), null);

		expect(access.leaveBot).not.toHaveBeenCalled();
		expect(said()).toContain('єдиний власник');
	});

	it('підказує видати запасний код і як все ж вийти', async () => {
		access.findActor.mockResolvedValue(admin);
		access.isLastAdmin.mockResolvedValue(true);

		await handleUpdate(message('/vyity'), null);

		expect(said()).toContain('/kod ADMIN');
		expect(said()).toContain('/vyity tak');
	});

	it('після підтвердження випускає й останнього', async () => {
		access.findActor.mockResolvedValue(admin);
		access.isLastAdmin.mockResolvedValue(true);

		await handleUpdate(message('/vyity tak'), null);

		expect(access.leaveBot).toHaveBeenCalledWith(admin);
		expect(said()).toContain('До зустрічі');
	});

	/** Менедżера питати ні про що: без нього власник нікуди не дінеться. */
	it('звичайного менеджера нічого не зупиняє', async () => {
		await handleUpdate(message('/vyity'), null);

		expect(access.leaveBot).toHaveBeenCalledWith(actor);
	});

	it('чужому виходити нема звідки', async () => {
		access.findActor.mockResolvedValue(null);

		await handleUpdate(message('/vyity'), null);

		expect(access.leaveBot).not.toHaveBeenCalled();
	});
});

describe('меню команд', () => {
	/**
	 * Меню ставиться в мить видачі доступу: раніше роль невідома, а без
	 * ролі невідомо, що людині показувати.
	 */
	it('після коду зʼявляється своє меню під роль', async () => {
		access.redeemInvite.mockResolvedValue({ ok: true, actor: admin, returning: false });

		await handleUpdate(message('/start ABC123'), null);

		const [chatId, commands] = api.setChatCommands.mock.calls[0];
		expect(chatId).toBe(777);
		expect(commands.map((item: { command: string }) => item.command)).toContain('zvit');
	});

	it('менеджеру команд власника в меню немає', async () => {
		access.redeemInvite.mockResolvedValue({ ok: true, actor, returning: false });

		await handleUpdate(message('/start ABC123'), null);

		const commands = api.setChatCommands.mock.calls[0][1] as { command: string }[];
		const names = commands.map((item) => item.command);
		expect(names).toContain('zamovlennia');
		expect(names).not.toContain('zvit');
		expect(names).not.toContain('kod');
	});

	/**
	 * Меню живе на боці Telegram і саме не оновлюється. Хто отримав
	 * доступ до того, як меню взагалі зʼявилось, той без цього так і лишився би
	 * без підказок назавжди.
	 */
	it('голий /start поновлює меню тому, хто вже має доступ', async () => {
		access.findActor.mockResolvedValue(admin);

		await handleUpdate(message('/start'), null);

		const commands = api.setChatCommands.mock.calls[0][1] as { command: string }[];
		expect(commands.map((item) => item.command)).toContain('zvit');
		expect(access.redeemInvite).not.toHaveBeenCalled();
	});

	it('/dopomoha теж поновлює меню', async () => {
		await handleUpdate(message('/dopomoha'), null);

		expect(api.setChatCommands).toHaveBeenCalledWith(
			actor.chatId,
			expect.arrayContaining([expect.objectContaining({ command: 'zamovlennia' })])
		);
	});

	it('чужому меню не ставиться', async () => {
		access.findActor.mockResolvedValue(null);

		await handleUpdate(message('/start'), null);

		expect(api.setChatCommands).not.toHaveBeenCalled();
	});

	it('поганий код меню не ставить', async () => {
		access.redeemInvite.mockResolvedValue({ ok: false, why: 'unknown' });

		await handleUpdate(message('/start NOPE'), null);

		expect(api.setChatCommands).not.toHaveBeenCalled();
	});
});

describe('довідка', () => {
	it('менеджер бачить свої команди й не бачить чужих', async () => {
		await handleUpdate(message('/dopomoha'), null);

		expect(said()).toContain('/zamovlennia');
		expect(said()).toContain('/vyity');
		expect(said()).not.toContain('/zvit');
	});

	it('власник бачить і свої', async () => {
		access.findActor.mockResolvedValue(admin);

		await handleUpdate(message('/dopomoha'), null);

		expect(said()).toContain('/zvit');
		expect(said()).toContain('/dostup');
	});
});
