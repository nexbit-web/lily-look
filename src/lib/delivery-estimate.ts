/**
 * «Отримаєте 10–12 вересня» — конкретна дата замість «1–3 дні».
 *
 * Дата рахується від київського календарного дня, а не від часу сервера:
 * хостинг живе в UTC, і ввечері за Києвом сервер показував би вчорашній
 * день. Замовлення до 15:00 їде того ж дня, після — наступного.
 */

const MONTHS = [
	'січня',
	'лютого',
	'березня',
	'квітня',
	'травня',
	'червня',
	'липня',
	'серпня',
	'вересня',
	'жовтня',
	'листопада',
	'грудня'
];

const KYIV = 'Europe/Kyiv';
const DAY = 86_400_000;

/** Після цієї години за Києвом посилка їде вже наступного дня. */
export const DISPATCH_CUTOFF_HOUR = 15;

export type DeliveryWindow = {
	/** Чи встигає замовлення на сьогоднішню відправку. */
	shipsToday: boolean;
	/** Готовий рядок для сторінки: «10–12 вересня». */
	eta: string;
};

function kyivNow(now: Date) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: KYIV,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);

	const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
	return {
		year: value('year'),
		month: value('month'),
		day: value('day'),
		hour: value('hour')
	};
}

/** «10 вересня», «10–12 вересня», «30 вересня – 2 жовтня». */
function label(from: Date, to: Date): string {
	const day = (date: Date) => date.getUTCDate();
	const month = (date: Date) => MONTHS[date.getUTCMonth()];

	if (from.getTime() === to.getTime()) return `${day(from)} ${month(from)}`;
	if (from.getUTCMonth() === to.getUTCMonth()) return `${day(from)}–${day(to)} ${month(from)}`;
	return `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;
}

/**
 * @param days [мінімум, максимум] днів у дорозі після відправки.
 */
export function deliveryWindow(now: Date, days: readonly [number, number]): DeliveryWindow {
	const kyiv = kyivNow(now);
	const shipsToday = kyiv.hour < DISPATCH_CUTOFF_HOUR;

	// Рахуємо в UTC-опівночі: так додавання днів не залежить від переходу
	// на літній час — це просто арифметика над календарними днями.
	const dispatch = Date.UTC(kyiv.year, kyiv.month - 1, kyiv.day + (shipsToday ? 0 : 1));
	const [min, max] = days;

	return {
		shipsToday,
		eta: label(new Date(dispatch + min * DAY), new Date(dispatch + max * DAY))
	};
}
