import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Видача доступу.
 *
 * Код — єдиний ключ до бота, тож перевіряємо саме те, через що такі схеми
 * зазвичай і течуть: повторне використання, гонка двох однакових запитів
 * і спроба обійти вимкнений у CRM доступ новим кодом.
 */

const db = {
	botUser: {
		findFirst: vi.fn(),
		findUnique: vi.fn(),
		findMany: vi.fn(),
		create: vi.fn(),
		update: vi.fn()
	},
	botInvite: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
	botUpdate: { create: vi.fn(), deleteMany: vi.fn() }
};

vi.mock('../db.js', () => ({ db }));

const {
	alreadyHandled,
	createInvite,
	findActor,
	generateCode,
	leaveBot,
	prunePastUpdates,
	redeemInvite,
	setAccess
} = await import('./access.js');

const profile = {
	telegramId: 777n,
	chatId: 777n,
	name: 'Олена Коваль',
	username: 'olena'
};

const user = {
	id: 'u1',
	telegramId: 777n,
	chatId: 777n,
	name: 'Олена Коваль',
	role: 'MANAGER'
};

beforeEach(() => {
	for (const model of Object.values(db)) {
		for (const method of Object.values(model)) method.mockReset();
	}
	db.botUser.findFirst.mockResolvedValue(null);
	db.botUser.findUnique.mockResolvedValue(null);
	db.botInvite.updateMany.mockResolvedValue({ count: 1 });
	db.botUser.create.mockResolvedValue(user);
	db.botInvite.update.mockResolvedValue({});
	db.botInvite.create.mockResolvedValue({});
	db.botUser.update.mockResolvedValue({});
	db.botUpdate.deleteMany.mockResolvedValue({ count: 0 });
});

const invite = (patch: Record<string, unknown> = {}) => ({
	id: 'i1',
	role: 'MANAGER',
	usedAt: null,
	expiresAt: null,
	...patch
});

describe('погашення коду', () => {
	it('код відкриває доступ і привʼязується до людини', async () => {
		db.botInvite.findUnique.mockResolvedValue(invite());

		const outcome = await redeemInvite('ABC123', profile);

		expect(outcome).toMatchObject({ ok: true, returning: false });
		// Роль береться з коду, а не з побажань того, хто його надіслав.
		expect(db.botUser.create.mock.calls[0][0].data).toMatchObject({
			telegramId: 777n,
			role: 'MANAGER'
		});
		expect(db.botInvite.update).toHaveBeenCalled();
	});

	it('роль кур’єра з коду доїжджає до користувача', async () => {
		db.botInvite.findUnique.mockResolvedValue(invite({ role: 'COURIER' }));

		await redeemInvite('ABC123', profile);

		expect(db.botUser.create.mock.calls[0][0].data.role).toBe('COURIER');
	});

	it('використаний код більше не працює', async () => {
		db.botInvite.findUnique.mockResolvedValue(invite({ usedAt: new Date() }));

		await expect(redeemInvite('ABC123', profile)).resolves.toEqual({ ok: false, why: 'used' });
		expect(db.botUser.create).not.toHaveBeenCalled();
	});

	it('неіснуючий код не відрізняється від використаного', async () => {
		db.botInvite.findUnique.mockResolvedValue(null);

		await expect(redeemInvite('ABC123', profile)).resolves.toEqual({ ok: false, why: 'unknown' });
	});

	it('протермінований код не працює', async () => {
		db.botInvite.findUnique.mockResolvedValue(invite({ expiresAt: new Date(Date.now() - 1000) }));

		await expect(redeemInvite('ABC123', profile)).resolves.toEqual({ ok: false, why: 'expired' });
		expect(db.botUser.create).not.toHaveBeenCalled();
	});

	/**
	 * Telegram повторює апдейти, тож той самий код може прилетіти двічі
	 * поспіль. Гасить його умовний `updateMany` — виграє рівно один.
	 */
	it('гонка двох однакових запитів: другий бачить, що код уже зайнятий', async () => {
		db.botInvite.findUnique.mockResolvedValue(invite());
		db.botInvite.updateMany.mockResolvedValue({ count: 0 });

		await expect(redeemInvite('ABC123', profile)).resolves.toEqual({ ok: false, why: 'used' });
		expect(db.botUser.create).not.toHaveBeenCalled();
	});

	/**
	 * Головне, заради чого перевірка взагалі є: вимкнений у CRM доступ не
	 * має відновлюватись новим кодом в обхід рішення власника.
	 */
	it('вимкненому доступу новий код не допомагає', async () => {
		db.botInvite.findUnique.mockResolvedValue(invite());
		// Активного немає, але рядок у базі є — значить, його вимкнули.
		db.botUser.findUnique.mockResolvedValue({ id: 'u1' });

		await expect(redeemInvite('ABC123', profile)).resolves.toEqual({ ok: false, why: 'taken' });
		expect(db.botUser.create).not.toHaveBeenCalled();
	});

	it('людина з доступом просто вітається, код не витрачається', async () => {
		db.botUser.findFirst.mockResolvedValue(user);

		const outcome = await redeemInvite('ABC123', profile);

		expect(outcome).toMatchObject({ ok: true, returning: true });
		expect(db.botInvite.updateMany).not.toHaveBeenCalled();
	});
});

describe('хто це', () => {
	it('вимкнений у CRM перестає бути своїм', async () => {
		db.botUser.findFirst.mockResolvedValue(null);

		await expect(findActor(777n)).resolves.toBeNull();
		expect(db.botUser.findFirst.mock.calls[0][0].where).toMatchObject({ isActive: true });
	});
});

describe('повтори від Telegram', () => {
	it('перший раз обробляємо, другий — ні', async () => {
		db.botUpdate.create.mockResolvedValueOnce({});
		await expect(alreadyHandled(10n)).resolves.toBe(false);

		// Первинний ключ не дасть вставити той самий апдейт удруге.
		db.botUpdate.create.mockRejectedValueOnce(new Error('duplicate key'));
		await expect(alreadyHandled(10n)).resolves.toBe(true);
	});
});

describe('підбір коду', () => {
	/**
	 * Код — шість символів із мільярда варіантів, але лічильник спроб
	 * робить перебір безглуздим одразу. Головне тут — що відкинута спроба
	 * не коштує жодного запиту в базу.
	 */
	it('після пʼяти помилок бот перестає навіть дивитись у базу', async () => {
		db.botInvite.findUnique.mockResolvedValue(null);
		const attacker = { ...profile, telegramId: 9001n };

		for (let attempt = 0; attempt < 5; attempt += 1) {
			await expect(redeemInvite('WRONG', attacker)).resolves.toEqual({
				ok: false,
				why: 'unknown'
			});
		}

		const lookups = db.botInvite.findUnique.mock.calls.length;
		await expect(redeemInvite('WRONG', attacker)).resolves.toEqual({
			ok: false,
			why: 'throttled'
		});
		expect(db.botInvite.findUnique.mock.calls.length).toBe(lookups);
	});

	it('лічильник свій у кожного — сусіда він не блокує', async () => {
		db.botInvite.findUnique.mockResolvedValue(null);
		const attacker = { ...profile, telegramId: 9002n };
		for (let attempt = 0; attempt < 6; attempt += 1) await redeemInvite('WRONG', attacker);

		db.botInvite.findUnique.mockResolvedValue(invite());
		await expect(redeemInvite('GOOD', { ...profile, telegramId: 9003n })).resolves.toMatchObject({
			ok: true
		});
	});
});

describe('видача доступу власником', () => {
	it('код читається вголос: без 0/O/1/I', () => {
		for (let attempt = 0; attempt < 50; attempt += 1) {
			expect(generateCode()).toMatch(/^LILY-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
		}
	});

	it('коди не повторюються', () => {
		const seen = new Set(Array.from({ length: 200 }, () => generateCode()));
		expect(seen.size).toBe(200);
	});

	it('код створюється з роллю й терміном', async () => {
		const code = await createInvite('COURIER', 'Ігор', 7);

		const data = db.botInvite.create.mock.calls[0][0].data;
		expect(data.code).toBe(code);
		expect(data.role).toBe('COURIER');
		expect(data.expiresAt).toBeInstanceOf(Date);
	});

	it('нуль днів — код безстроковий', async () => {
		await createInvite('MANAGER', null, 0);

		expect(db.botInvite.create.mock.calls[0][0].data.expiresAt).toBeNull();
	});

	it('доступ закривається й відкривається за telegram id', async () => {
		db.botUser.findUnique.mockResolvedValue({ id: 'u1', name: 'Ігор' });

		await expect(setAccess(777n, false)).resolves.toEqual({ name: 'Ігор' });
		expect(db.botUser.update.mock.calls[0][0].data).toEqual({ isActive: false });
	});

	it('невідомий id нічого не міняє', async () => {
		db.botUser.findUnique.mockResolvedValue(null);

		await expect(setAccess(777n, false)).resolves.toBeNull();
		expect(db.botUser.update).not.toHaveBeenCalled();
	});
});

describe('прибирання', () => {
	it('старі записи про апдейти видаляються, свіжі лишаються', async () => {
		db.botUpdate.deleteMany.mockResolvedValue({ count: 12 });

		await expect(prunePastUpdates()).resolves.toBe(12);
		const cutoff = db.botUpdate.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
		expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
	});
});

describe('вихід і повернення', () => {
	/**
	 * Різниця між «пішов сам» і «прибрав власник» — уся суть `leftAt`.
	 * Перший може повернутись новим кодом, другий ні, інакше вимикач у CRM
	 * обходився б у два повідомлення.
	 */
	it('вихід не видаляє рядок — журнал подій на ньому тримається', async () => {
		await leaveBot({
			id: 'u1',
			telegramId: 777n,
			chatId: 777n,
			name: 'Олена',
			role: 'MANAGER'
		});

		expect(db.botUser.update.mock.calls[0][0]).toMatchObject({ where: { id: 'u1' } });
		const data = db.botUser.update.mock.calls[0][0].data;
		expect(data.isActive).toBe(false);
		expect(data.leftAt).toBeInstanceOf(Date);
	});

	it('той, хто вийшов сам, повертається новим кодом', async () => {
		db.botInvite.findUnique.mockResolvedValue(invite({ role: 'COURIER' }));
		db.botUser.findUnique.mockResolvedValue({ id: 'u1', leftAt: new Date() });
		db.botUser.update.mockResolvedValue({ ...user, role: 'COURIER' });

		const outcome = await redeemInvite('ABC123', profile);

		expect(outcome).toMatchObject({ ok: true, returning: false });
		// Оновлюємо старий рядок, а не заводимо новий.
		expect(db.botUser.create).not.toHaveBeenCalled();
		const data = db.botUser.update.mock.calls[0][0].data;
		expect(data).toMatchObject({ isActive: true, leftAt: null, role: 'COURIER' });
	});

	it('того, кого прибрав власник, новий код не повертає', async () => {
		db.botInvite.findUnique.mockResolvedValue(invite());
		db.botUser.findUnique.mockResolvedValue({ id: 'u1', leftAt: null });

		await expect(redeemInvite('ABC123', profile)).resolves.toEqual({ ok: false, why: 'taken' });
		expect(db.botUser.update).not.toHaveBeenCalled();
		expect(db.botUser.create).not.toHaveBeenCalled();
	});

	it('той, хто вийшов, перестає бути своїм одразу', async () => {
		db.botUser.findFirst.mockResolvedValue(null);

		await expect(findActor(777n)).resolves.toBeNull();
		expect(db.botUser.findFirst.mock.calls[0][0].where).toMatchObject({
			isActive: true,
			leftAt: null
		});
	});
});
