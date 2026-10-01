import { WHEEL_PRIZES } from '$lib/config';
import type { ActivePrize } from '$lib/types';

/**
 * Приз колеса фортуни: пошук за кодом, сектори й сума знижки. Спільне для
 * сервера (розіграш, замовлення) і сторінок (колесо, кошик, оформлення) —
 * щоб покупець бачив рівно ту суму, яку потім запише замовлення.
 */

export function prizeByCode(code: string) {
	return WHEEL_PRIZES.find((prize) => prize.code === code) ?? null;
}

const TOTAL_WEIGHT = WHEEL_PRIZES.reduce((sum, prize) => sum + prize.weight, 0);

/**
 * Сектори колеса в градусах від 12-ї години за годинниковою стрілкою.
 * Усі однакові — колесо симетричне. Шанс від ширини не залежить: його
 * задає `weight` (див. `prizeAt`), а колесо лише докручується до
 * сектора, який уже вибрав сервер.
 */
const SECTOR_DEG = 360 / WHEEL_PRIZES.length;

export const WHEEL_SECTORS = WHEEL_PRIZES.map((prize, index) => {
	const from = index * SECTOR_DEG;
	const to = from + SECTOR_DEG;
	return { code: prize.code, from, to, center: from + SECTOR_DEG / 2 };
});

/**
 * Приз за випадковим числом із [0, 1): кожен приз займає на відрізку
 * частку, рівну своїй вазі (`weight`). Саме число дає сервер
 * криптографічним генератором.
 */
export function prizeAt(fraction: number) {
	let point = Math.min(Math.max(fraction, 0), 0.999999) * TOTAL_WEIGHT;
	for (const prize of WHEEL_PRIZES) {
		if (point < prize.weight) return prize;
		point -= prize.weight;
	}
	return WHEEL_PRIZES[WHEEL_PRIZES.length - 1];
}

/**
 * Знижка приза в копійках. Округлюємо до цілої гривні: ціни на сайті без
 * копійок, і «−200,90 грн» у підсумку виглядало б як помилка.
 * Рахується від суми товарів — уже зі знижками CRM, якщо вони є.
 */
export function prizeDiscount(
	prize: Pick<ActivePrize, 'percent'> | null,
	subtotal: number
): number {
	if (!prize || prize.percent <= 0 || subtotal <= 0) return 0;
	return Math.round((subtotal * prize.percent) / 100 / 100) * 100;
}

/** Код сектора «Ще спроба». */
export const RETRY = 'retry';

/** «Ще спроба» — не приз, а ще один оберт колеса. */
export function isRetry(prize: Pick<ActivePrize, 'code'>): boolean {
	return prize.code === RETRY;
}

/** Скільки лишилось до кінця приза: «23:59:07». */
export function formatCountdown(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}
