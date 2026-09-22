import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Видача доступу.
 *
 * Код — єдиний ключ до бота, тож перевіряємо саме те, через що такі схеми
 * зазвичай і течуть: повторне використання, гонка двох однакових запитів
 * і спроба обійти вимкнений у CRM доступ новим кодом.
 */

const db = {
	botUser: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
	botInvite: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
	botUpdate: { create: vi.fn() }
};

vi.mock('../db.js', () => ({ db }));

const { alreadyHandled, findActor, redeemInvite } = await import('./access.js');

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
