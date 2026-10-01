import type { Cookies } from '@sveltejs/kit';
import { WHEEL_PRIZE_HOURS } from '$lib/config';
import type { ActivePrize } from '$lib/types';
import { isRetry, prizeAt, prizeByCode } from '$lib/wheel';
import type { Prisma } from '../../../prisma/generated/client.js';
import { db } from './db.js';

/**
 * Колесо фортуни на сервері.
 *
 * Приз вибирає сервер, а не браузер: колесо в браузері лише докручується
 * до сектора, який уже записано в базу. Підмінити виграш у DevTools нічим —
 * у куці лежить тільки id розіграшу, а сам приз і строк — у `WheelSpin`.
 */

/** Id розіграшу. httpOnly — скрипти сторінки його не бачать і не підмінять. */
export const PRIZE_COOKIE = 'lily_prize';

/**
 * Позначка «колесо вже показували». Не httpOnly: вікно закривають у браузері,
 * і саме браузер ставить її при закритті. Рік — щоб не набридати.
 */
export const WHEEL_SEEN_COOKIE = 'lily_wheel';

const HOUR = 60 * 60 * 1000;

/**
 * Скільки обертів на годину з однієї IP-адреси. Без кук кожне натискання —
 * новий рядок у базі, і скрипт міг би засипати її розіграшами. Людині з
 * «Ще спробою» вистачить із запасом; кілька покупців за одним домашнім
 * роутером — теж.
 */
const SPINS_PER_IP_HOUR = 10;
const spinsByIp = new Map<string, number[]>();

/** Чи можна ще крутити з цієї адреси. Невідома адреса (локальний запуск) — можна. */
function spinAllowed(ip: string | null, now: number): boolean {
	if (!ip) return true;
	const recent = (spinsByIp.get(ip) ?? []).filter((at) => now - at < HOUR);
	if (recent.length >= SPINS_PER_IP_HOUR) {
		spinsByIp.set(ip, recent);
		return false;
	}
	recent.push(now);
	spinsByIp.set(ip, recent);
	// Пам'ять не росте без кінця: найстаріші адреси викидаємо.
	if (spinsByIp.size > 10_000) {
		const oldest = spinsByIp.keys().next().value;
		if (oldest !== undefined) spinsByIp.delete(oldest);
	}
	return true;
}

/** Для тестів: забути ліміти між сценаріями. */
export function resetSpinLimits() {
	spinsByIp.clear();
}

function toActive(row: { prize: string; expiresAt: Date }): ActivePrize | null {
	const prize = prizeByCode(row.prize);
	if (!prize) return null;
	return {
		code: prize.code,
		label: prize.label,
		percent: prize.percent,
		freeDelivery: prize.freeDelivery,
		expiresAt: row.expiresAt.toISOString()
	};
}

/**
 * Шанси — як ширина секторів на колесі (`weight` у `WHEEL_PRIZES`).
 * Криптографічний генератор, без «підкрутки»: який сектор показало колесо,
 * такий приз і записано.
 */
function drawPrize() {
	const [random] = crypto.getRandomValues(new Uint32Array(1));
	return prizeAt(random / 2 ** 32);
}

/**
 * Обертання колеса — одне на людину.
 *
 * Уже крутив (кука розіграшу жива) — отримує свій результат знову, навіть
 * якщо надіслав форму вдруге. Колесо вже бачив і закрив (кука
 * `lily_wheel`) — крутити не можна, `null`. Забагато обертів з однієї
 * адреси за годину — теж `null`.
 *
 * Почистити куки й покрутити знову можна — але подарунок усе одно один
 * на номер телефону (`placeOrder` в `orders.ts`).
 */
export async function spinWheel(
	cookies: Cookies,
	/** IP покупця — для ліміту обертів (`clientIp`). */
	ip: string | null = null
): Promise<ActivePrize | null> {
	const id = cookies.get(PRIZE_COOKIE);
	if (id) {
		const row = await db.wheelSpin.findUnique({
			where: { id },
			select: { prize: true, expiresAt: true }
		});
		// Розіграш із невідомим кодом (сектор, якого вже немає на колесі)
		// не рахуємо — інакше колесо показало б приз, а сервер відмовив.
		const prize = row ? toActive(row) : null;
		if (prize) return prize;
	}
	if (cookies.get(WHEEL_SEEN_COOKIE)) return null;
	if (!spinAllowed(ip, Date.now())) return null;

	const prize = drawPrize();

	// «Ще спроба» нічого не дає й нічого не витрачає: не пишемо в базу й
	// не ставимо кук — наступне натискання розіграє колесо заново.
	if (isRetry(prize)) {
		return { code: prize.code, label: prize.label, percent: 0, freeDelivery: false, expiresAt: '' };
	}

	const expiresAt = new Date(Date.now() + WHEEL_PRIZE_HOURS * HOUR);
	const spin = await db.wheelSpin.create({
		data: { prize: prize.code, expiresAt },
		select: { id: true }
	});

	cookies.set(PRIZE_COOKIE, spin.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: WHEEL_PRIZE_HOURS * 60 * 60
	});
	markWheelSeen(cookies);

	return {
		code: prize.code,
		label: prize.label,
		percent: prize.percent,
		freeDelivery: prize.freeDelivery,
		expiresAt: expiresAt.toISOString()
	};
}

/** Колесо більше не показуємо — ні після виграшу, ні після закриття. */
export function markWheelSeen(cookies: Cookies) {
	cookies.set(WHEEL_SEEN_COOKIE, '1', {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: 365 * 24 * 60 * 60
	});
}

/**
 * Чинний приз покупця: виграний, ще не використаний і не прострочений.
 * Без куки в базу не ходимо — у більшості відвідувачів її немає.
 */
export async function readPrize(cookies: Cookies): Promise<ActivePrize | null> {
	const id = cookies.get(PRIZE_COOKIE);
	if (!id) return null;

	const row = await db.wheelSpin.findFirst({
		where: { id, usedAt: null, expiresAt: { gt: new Date() } },
		select: { prize: true, expiresAt: true }
	});
	return row ? toActive(row) : null;
}

/**
 * Забрати приз у замовлення — всередині транзакції замовлення.
 *
 * Умова «не використаний і не прострочений» прямо в UPDATE: два
 * замовлення, оформлені одночасно, не отримають один приз двічі. Не
 * вийшло (прострочився, поки покупець заповнював форму) — замовлення
 * оформлюється без приза, а не падає.
 */
export async function claimPrize(
	tx: Prisma.TransactionClient,
	spinId: string | undefined,
	orderNumber: string
): Promise<ActivePrize | null> {
	if (!spinId) return null;

	const row = await tx.wheelSpin.findFirst({
		where: { id: spinId, usedAt: null, expiresAt: { gt: new Date() } },
		select: { prize: true, expiresAt: true }
	});
	const prize = row ? toActive(row) : null;
	if (!prize) return null;

	const claimed = await tx.wheelSpin.updateMany({
		where: { id: spinId, usedAt: null },
		data: { usedAt: new Date(), orderNumber }
	});
	return claimed.count === 1 ? prize : null;
}

/** Приз використано — куку прибираємо, щоб смужка з таймером зникла. */
export function forgetPrize(cookies: Cookies) {
	cookies.delete(PRIZE_COOKIE, { path: '/' });
}
