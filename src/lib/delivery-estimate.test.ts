import { describe, expect, it } from 'vitest';
import { deliveryWindow } from './delivery-estimate';

/**
 * Дата отримання — обіцянка покупцеві. Помилка тут не ламає сайт, зате
 * магазин обіцяє те, чого не виконає, тому перевіряємо межі: поріг 15:00,
 * перехід через місяць і те, що рахунок іде за київським днем, а не за
 * годинником сервера.
 */

const NP = [1, 3] as const;

describe('дата отримання', () => {
	it('замовлення зранку їде сьогодні', () => {
		// 10:00 за Києвом (07:00 UTC влітку).
		const window = deliveryWindow(new Date('2026-09-07T07:00:00Z'), NP);

		expect(window.shipsToday).toBe(true);
		expect(window.eta).toBe('8–10 вересня');
	});

	it('після 15:00 відправка переїжджає на завтра', () => {
		const window = deliveryWindow(new Date('2026-09-07T13:00:00Z'), NP);

		expect(window.shipsToday).toBe(false);
		expect(window.eta).toBe('9–11 вересня');
	});

	it('поріг рахується за Києвом, а не за UTC', () => {
		// 22:00 у Києві — це ще 19:00 UTC: за UTC поріг ніби не минув.
		const window = deliveryWindow(new Date('2026-09-07T19:00:00Z'), NP);
		expect(window.shipsToday).toBe(false);
	});

	it('вікно, що переходить у новий місяць, називає обидва', () => {
		const window = deliveryWindow(new Date('2026-09-29T07:00:00Z'), NP);
		expect(window.eta).toBe('30 вересня – 2 жовтня');
	});

	it('самовивіз тим самим днем — одна дата, без діапазону', () => {
		const window = deliveryWindow(new Date('2026-09-07T07:00:00Z'), [0, 0]);
		expect(window.eta).toBe('7 вересня');
	});

	it('через новий рік дати не збиваються', () => {
		// 30 грудня + 2…5 днів — уже січень, обидві дати в одному місяці.
		const window = deliveryWindow(new Date('2026-12-30T07:00:00Z'), [2, 5]);
		expect(window.eta).toBe('1–4 січня');
	});
});
