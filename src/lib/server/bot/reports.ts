import { statusLabel, type OrderStatusValue } from '$lib/bot-workflow';
import { formatPrice } from '$lib/money';
import { escapeHtml } from '$lib/order-message';
import { db } from '../db.js';

/**
 * Звіт для власника.
 *
 * Тут свідомо мало запитів: три агрегати паралельно замість десятка
 * `count()` по кожному статусу. Рахує їх база, а не додаток, — з бази
 * приїжджають готові числа, а не рядки замовлень.
 */

/** Північ за київським часом: доба рахується так, як її бачить менеджер. */
function startOfKyivDay(now: Date): Date {
	const kyiv = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
	const shift = now.getTime() - kyiv.getTime();
	kyiv.setHours(0, 0, 0, 0);
	return new Date(kyiv.getTime() + shift);
}

export async function buildReport(now = new Date()): Promise<string> {
	const dayStart = startOfKyivDay(now);
	const weekStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

	// Гроші рахуємо без скасованих: це не виторг.
	const earning = { status: { not: 'CANCELLED' as const } };

	const [byStatus, today, week, people] = await Promise.all([
		db.order.groupBy({ by: ['status'], _count: { _all: true } }),
		db.order.aggregate({
			where: { createdAt: { gte: dayStart }, ...earning },
			_count: { _all: true },
			_sum: { total: true }
		}),
		db.order.aggregate({
			where: { createdAt: { gte: weekStart }, ...earning },
			_count: { _all: true },
			_sum: { total: true }
		}),
		db.botUser.count({ where: { isActive: true } })
	]);

	const counts = new Map(byStatus.map((row) => [row.status as OrderStatusValue, row._count._all]));
	const order: OrderStatusValue[] = ['NEW', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

	const lines = order
		.filter((status) => (counts.get(status) ?? 0) > 0)
		.map((status) => `${escapeHtml(statusLabel(status))}: ${counts.get(status)}`);

	const waiting = counts.get('NEW') ?? 0;

	return [
		'<b>Звіт</b>',
		'',
		'<b>Замовлення</b>',
		...(lines.length ? lines : ['поки жодного']),
		'',
		'<b>Виторг</b>',
		`Сьогодні: ${today._count._all} на ${formatPrice(today._sum.total ?? 0)}`,
		`За 7 днів: ${week._count._all} на ${formatPrice(week._sum.total ?? 0)}`,
		'',
		waiting > 0 ? `Чекають на обробку: ${waiting}` : 'Необроблених немає',
		`Людей із доступом: ${people}`
	].join('\n');
}
