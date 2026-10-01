/**
 * Фізика оберту колеса фортуни — без DOM, щоб її можна було перевірити.
 *
 * Колесо крутиться в два етапи:
 *  1. Розгін і рівне обертання, поки сервер вибирає приз. Покупець натиснув
 *     — і колесо одразу пішло, без паузи на запит.
 *  2. Гальмування: щойно приз відомий, колесо плавно сповільнюється і
 *     зупиняється рівно на його секторі.
 *
 * Гальмування — кубічна крива `1 − (1 − t)³`. Її швидкість на старті
 * дорівнює 3·D/T, тож довжину гальмування D і тривалість T підбираємо так,
 * щоб швидкість не стрибала в момент переходу з першого етапу в другий:
 * колесо не смикається, а саме «видихається».
 */

/** Найбільша швидкість, градусів за секунду. */
export const TOP_SPEED = 1080;
/** За скільки колесо розганяється до найбільшої швидкості, мс. */
export const SPIN_UP_MS = 450;
/** Скільки щонайменше крутиться на повній швидкості, навіть якщо сервер відповів миттєво. */
export const MIN_FREE_SPIN_MS = 1100;
/** Приблизна тривалість гальмування, мс. */
export const BRAKE_MS = 4600;

/** Кут розгону: швидкість росте від нуля до TOP_SPEED за SPIN_UP_MS. */
export function spinUpAngle(elapsedMs: number): number {
	const t = Math.min(elapsedMs, SPIN_UP_MS) / 1000;
	const rampSeconds = SPIN_UP_MS / 1000;
	// Рівноприскорений розгін, далі — рівне обертання.
	const ramp = (TOP_SPEED * t * t) / (2 * rampSeconds);
	const cruise = (TOP_SPEED * Math.max(0, elapsedMs - SPIN_UP_MS)) / 1000;
	return ramp + cruise;
}

export type Brake = { from: number; distance: number; durationMs: number };

/**
 * Гальмування з кута `from` на швидкості TOP_SPEED так, щоб стрілка
 * зупинилась на куті колеса `pointerAngle` (0° — 12-та година, за
 * годинниковою стрілкою; це точка сектора під стрілкою).
 */
export function planBrake(from: number, pointerAngle: number): Brake {
	const speed = TOP_SPEED / 1000; // градусів за мс
	const natural = (speed * BRAKE_MS) / 3;
	// Поворот диска, за якого під стрілкою стоїть потрібна точка.
	const wanted = (((360 - pointerAngle) % 360) + 360) % 360;
	const end = from + natural;
	const extra = (((wanted - end) % 360) + 360) % 360;
	const distance = natural + extra;
	return { from, distance, durationMs: (3 * distance) / speed };
}

/** Кут під час гальмування; `elapsedMs` від початку гальмування. */
export function brakeAngle(brake: Brake, elapsedMs: number): number {
	const t = Math.min(1, Math.max(0, elapsedMs / brake.durationMs));
	return brake.from + brake.distance * (1 - (1 - t) ** 3);
}

/** Яка точка колеса (у градусах від 12-ї години) зараз під стрілкою. */
export function pointerAt(rotation: number): number {
	return (((360 - rotation) % 360) + 360) % 360;
}
