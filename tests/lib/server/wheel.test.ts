import type { Cookies } from '@sveltejs/kit';
import { WHEEL_PRIZE_HOURS, WHEEL_PRIZES } from '$lib/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Розіграш колеса. Головне — чесність і те, що крутити можна лише раз, а
 * приз не підробити в браузері.
 */

const db = {
	wheelSpin: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() }
};
vi.mock('$lib/server/db', () => ({ db }));

const { readPrize, resetSpinLimits, spinWheel, PRIZE_COOKIE, WHEEL_SEEN_COOKIE } =
	await import('$lib/server/wheel');

let jar: Record<string, string> = {};
const cookies = {
	get: (name: string) => jar[name],
	set: vi.fn((name: string, value: string) => {
		jar[name] = value;
	}),
	delete: vi.fn()
} as unknown as Cookies;

const later = () => new Date(Date.now() + 3600_000);

beforeEach(() => {
	jar = {};
	db.wheelSpin.create.mockReset().mockResolvedValue({ id: 'spin-1' });
	db.wheelSpin.findFirst.mockReset();
	db.wheelSpin.findUnique.mockReset();
	vi.mocked(cookies.set).mockClear();
	resetSpinLimits();
});

describe('spinWheel', () => {
	it('записує розіграш у базу, а в куку — лише його id', async () => {
		// Нуль — перший сектор, справжній приз (не «Ще спроба», яка в базу не пише).
		const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementationOnce(((
			array: Uint32Array
		) => {
			array[0] = 0;
			return array;
		}) as unknown as typeof crypto.getRandomValues);
		const before = Date.now();
		const prize = await spinWheel(cookies);
		spy.mockRestore();

		const data = db.wheelSpin.create.mock.calls[0][0].data;
		expect(WHEEL_PRIZES.map((item) => item.code)).toContain(data.prize);
		expect(prize?.code).toBe(data.prize);
		expect(data.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
			WHEEL_PRIZE_HOURS * 3600_000 - 1000
		);

		expect(cookies.set).toHaveBeenCalledWith(
			PRIZE_COOKIE,
			'spin-1',
			expect.objectContaining({ httpOnly: true, maxAge: WHEEL_PRIZE_HOURS * 3600 })
		);
		expect(jar[WHEEL_SEEN_COOKIE]).toBe('1');
	});

	it('другий раз не крутить — повертає вже виграний результат', async () => {
		jar[PRIZE_COOKIE] = 'spin-1';
		db.wheelSpin.findUnique.mockResolvedValue({ prize: 'off5', expiresAt: later() });

		const prize = await spinWheel(cookies);

		expect(prize?.code).toBe('off5');
		expect(db.wheelSpin.create).not.toHaveBeenCalled();
	});

	it('кука веде на розіграш зі старим кодом — крутить заново, а не відмовляє', async () => {
		jar[PRIZE_COOKIE] = 'old-spin';
		db.wheelSpin.findUnique.mockResolvedValue({ prize: 'off0', expiresAt: later() });

		const prize = await spinWheel(cookies);

		expect(prize).not.toBeNull();
		expect(prize?.code).not.toBe('off0');
	});

	it('колесо вже бачили й закрили — крутити не можна', async () => {
		jar[WHEEL_SEEN_COOKIE] = '1';

		await expect(spinWheel(cookies)).resolves.toBeNull();
		expect(db.wheelSpin.create).not.toHaveBeenCalled();
	});

	it('«Ще спроба» нічого не пише й не витрачає — можна крутити знову', async () => {
		const spy = vi.spyOn(crypto, 'getRandomValues');
		const retryAt = WHEEL_PRIZES.findIndex((prize) => prize.code === 'retry');
		// Точка всередині сектора «Ще спроба» — він останній на колесі.
		expect(retryAt).toBe(WHEEL_PRIZES.length - 1);
		spy.mockImplementationOnce(((array: Uint32Array) => {
			array[0] = 2 ** 32 - 1;
			return array;
		}) as unknown as typeof crypto.getRandomValues);

		const result = await spinWheel(cookies);
		spy.mockRestore();

		expect(result?.code).toBe('retry');
		expect(db.wheelSpin.create).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
		// Наступне натискання — справжній розіграш (нуль — перший сектор, приз).
		const next = vi.spyOn(crypto, 'getRandomValues').mockImplementationOnce(((
			array: Uint32Array
		) => {
			array[0] = 0;
			return array;
		}) as unknown as typeof crypto.getRandomValues);
		await spinWheel(cookies);
		next.mockRestore();
		expect(db.wheelSpin.create).toHaveBeenCalledTimes(1);
	});

	it('сектор визначає випадкове число криптографічного генератора', async () => {
		const spy = vi.spyOn(crypto, 'getRandomValues');
		// Число біля нуля — перший сектор, біля максимуму — останній.
		const cases = [
			[0, WHEEL_PRIZES[0].code],
			[2 ** 32 - 1, WHEEL_PRIZES.at(-1)!.code]
		] as const;
		for (const [value, expected] of cases) {
			if (expected === 'retry') continue;
			spy.mockImplementationOnce(((array: Uint32Array) => {
				array[0] = value;
				return array;
			}) as unknown as typeof crypto.getRandomValues);
			jar = {};
			expect((await spinWheel(cookies))?.code).toBe(expected);
		}
		spy.mockRestore();
	});
});

describe('ліміт обертів з однієї адреси', () => {
	/** Обертів без кук — щоразу новий розіграш, як у скрипта, що чистить куки. */
	async function spinFresh(ip: string | null) {
		jar = {};
		return spinWheel(cookies, ip);
	}

	it('десять обертів на годину з адреси, далі — відмова й нічого в базі', async () => {
		for (let i = 0; i < 10; i++) expect(await spinFresh('93.74.1.2')).not.toBeNull();
		db.wheelSpin.create.mockClear();

		await expect(spinFresh('93.74.1.2')).resolves.toBeNull();
		expect(db.wheelSpin.create).not.toHaveBeenCalled();
	});

	it('інша адреса — свій ліміт', async () => {
		for (let i = 0; i < 10; i++) await spinFresh('93.74.1.2');

		await expect(spinFresh('93.74.9.9')).resolves.not.toBeNull();
	});

	it('за годину ліміт знову вільний', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-02T10:00:00Z') });
		try {
			for (let i = 0; i < 10; i++) await spinFresh('93.74.1.2');
			await expect(spinFresh('93.74.1.2')).resolves.toBeNull();

			vi.setSystemTime(new Date('2026-10-02T11:00:01Z'));
			await expect(spinFresh('93.74.1.2')).resolves.not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('свій приз за живою кукою віддається й понад ліміт — це не новий розіграш', async () => {
		for (let i = 0; i < 10; i++) await spinFresh('93.74.1.2');
		jar = { [PRIZE_COOKIE]: 'spin-1' };
		db.wheelSpin.findUnique.mockResolvedValue({ prize: 'off5', expiresAt: later() });

		await expect(spinWheel(cookies, '93.74.1.2')).resolves.toMatchObject({ code: 'off5' });
	});
});

describe('readPrize', () => {
	it('без куки в базу не ходить', async () => {
		await expect(readPrize(cookies)).resolves.toBeNull();
		expect(db.wheelSpin.findFirst).not.toHaveBeenCalled();
	});

	it('шукає лише невикористаний і не прострочений приз', async () => {
		jar[PRIZE_COOKIE] = 'spin-1';
		db.wheelSpin.findFirst.mockResolvedValue(null);

		await expect(readPrize(cookies)).resolves.toBeNull();
		expect(db.wheelSpin.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'spin-1', usedAt: null, expiresAt: { gt: expect.any(Date) } }
			})
		);
	});

	it('віддає назву, знижку й строк приза', async () => {
		jar[PRIZE_COOKIE] = 'spin-1';
		const expiresAt = new Date('2026-10-02T10:00:00Z');
		db.wheelSpin.findFirst.mockResolvedValue({ prize: 'delivery', expiresAt });

		await expect(readPrize(cookies)).resolves.toEqual({
			code: 'delivery',
			label: 'Безкоштовна доставка',
			percent: 0,
			freeDelivery: true,
			expiresAt: expiresAt.toISOString()
		});
	});

	it('невідомий код приза (з минулих версій колеса) — приза немає', async () => {
		jar[PRIZE_COOKIE] = 'spin-1';
		db.wheelSpin.findFirst.mockResolvedValue({ prize: 'off0', expiresAt: later() });

		await expect(readPrize(cookies)).resolves.toBeNull();
	});
});
