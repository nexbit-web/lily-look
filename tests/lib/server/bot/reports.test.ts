import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Звіт для власника.
 *
 * Два предмети перевірки: числа не брешуть (скасовані не рахуються
 * виторгом) і база не навантажується — рахує вона, причому кількома
 * агрегатами паралельно, а не вибіркою замовлень у память.
 */

const db = {
	order: { groupBy: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
	botUser: { count: vi.fn() }
};

vi.mock('$lib/server/db', () => ({ db }));

const { buildReport } = await import('$lib/server/bot/reports');

const money = (total: number, count: number) => ({
	_count: { _all: count },
	_sum: { total }
});

beforeEach(() => {
	db.order.groupBy.mockReset().mockResolvedValue([
		{ status: 'NEW', _count: { _all: 2 } },
		{ status: 'DELIVERED', _count: { _all: 5 } },
		{ status: 'CANCELLED', _count: { _all: 1 } }
	]);
	db.order.aggregate
		.mockReset()
		.mockResolvedValueOnce(money(264_900, 1))
		.mockResolvedValue(money(1_324_500, 5));
	db.order.findMany.mockReset();
	db.botUser.count.mockReset().mockResolvedValue(3);
});

describe('зміст', () => {
	it('показує стани, гроші й скільки чекає обробки', async () => {
		const text = await buildReport(new Date('2026-09-23T10:00:00Z'));

		expect(text).toContain('Нове: 2');
		expect(text).toContain('Доставлене: 5');
		expect(text).toContain('Чекають на обробку: 2');
		expect(text).toContain('Людей із доступом: 3');
	});

	it('порожні стани не засмічують звіт', async () => {
		const text = await buildReport(new Date('2026-09-23T10:00:00Z'));

		expect(text).not.toContain('Відправлене');
	});

	it('порожня база не ламає звіт', async () => {
		db.order.groupBy.mockResolvedValue([]);
		db.order.aggregate
			.mockReset()
			.mockResolvedValue({ _count: { _all: 0 }, _sum: { total: null } });

		const text = await buildReport(new Date('2026-09-23T10:00:00Z'));

		expect(text).toContain('поки жодного');
		expect(text).toContain('Необроблених немає');
	});
});

describe('гроші', () => {
	/** Скасоване — не виторг, і в сумах його бути не повинно. */
	it('скасовані не потрапляють у суми', async () => {
		await buildReport(new Date('2026-09-23T10:00:00Z'));

		for (const call of db.order.aggregate.mock.calls) {
			expect(call[0].where.status).toEqual({ not: 'CANCELLED' });
		}
	});

	it('рахує добу й тиждень окремо', async () => {
		await buildReport(new Date('2026-09-23T10:00:00Z'));

		const [day, week] = db.order.aggregate.mock.calls.map(
			(call) => call[0].where.createdAt.gte as Date
		);
		const days = (day.getTime() - week.getTime()) / (24 * 60 * 60 * 1000);
		expect(Math.round(days)).toBe(6);
	});
});

describe('навантаження', () => {
	/**
	 * Рахувати статуси десятком `count()` або тягнути замовлення в памʼять —
	 * саме те, чого тут не має бути.
	 */
	it('жодного разу не вибирає самі замовлення', async () => {
		await buildReport(new Date('2026-09-23T10:00:00Z'));

		expect(db.order.findMany).not.toHaveBeenCalled();
		expect(db.order.groupBy).toHaveBeenCalledTimes(1);
		expect(db.order.aggregate).toHaveBeenCalledTimes(2);
	});
});
