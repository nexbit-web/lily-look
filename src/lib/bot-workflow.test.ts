import { describe, expect, it } from 'vitest';
import { actionsFor, canMove, decodeAction, encodeAction, keyboardFor } from './bot-workflow';

/**
 * Правила руху замовлення.
 *
 * Тут важлива не стільки сама таблиця переходів, скільки те, що кнопки й
 * перевірка на сервері рахуються з неї однаково: намальована кнопка має
 * спрацювати, а ненамальована — ні, навіть якщо її дані підкинути руками.
 */

describe('переходи', () => {
	it('нове замовлення менеджер приймає або скасовує', () => {
		expect(actionsFor('NEW', 'MANAGER').map((action) => action.to)).toEqual([
			'CONFIRMED',
			'CANCELLED'
		]);
	});

	it('закрите замовлення нікуди не рухається', () => {
		expect(actionsFor('DELIVERED', 'MANAGER')).toEqual([]);
		expect(actionsFor('CANCELLED', 'MANAGER')).toEqual([]);
	});

	it('через крок перестрибнути не можна', () => {
		expect(canMove('NEW', 'SHIPPED', 'MANAGER')).toBe(false);
		expect(canMove('NEW', 'CONFIRMED', 'MANAGER')).toBe(true);
	});

	it('назад теж не можна — журнал не переписують', () => {
		expect(canMove('SHIPPED', 'CONFIRMED', 'MANAGER')).toBe(false);
	});
});

describe("кур'єр", () => {
	it('бачить тільки «Отримано» й лише у відправленому', () => {
		expect(actionsFor('SHIPPED', 'COURIER').map((action) => action.to)).toEqual(['DELIVERED']);
		expect(actionsFor('NEW', 'COURIER')).toEqual([]);
		expect(actionsFor('CONFIRMED', 'COURIER')).toEqual([]);
	});

	it('скасувати замовлення не може', () => {
		expect(canMove('SHIPPED', 'CANCELLED', 'COURIER')).toBe(false);
		expect(canMove('SHIPPED', 'CANCELLED', 'MANAGER')).toBe(true);
	});
});

describe('дані кнопки', () => {
	it('туди й назад без втрат', () => {
		expect(decodeAction(encodeAction('LL-ABC234', 'SHIPPED'))).toEqual({
			number: 'LL-ABC234',
			to: 'SHIPPED'
		});
	});

	/** 64 байти — стеля Telegram; за неї кнопка просто не надішлеться. */
	it('влазить у ліміт Telegram', () => {
		const data = encodeAction('LL-ABCDEF', 'CANCELLED');
		expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
	});

	it('сміття не перетворюється на дію', () => {
		expect(decodeAction('')).toBeNull();
		expect(decodeAction('o:LL-ABC234')).toBeNull();
		expect(decodeAction('x:LL-ABC234:SHIPPED')).toBeNull();
		// Статусу з такою назвою не існує — підкинули руками.
		expect(decodeAction('o:LL-ABC234:REFUNDED')).toBeNull();
	});
});

describe('клавіатура', () => {
	it("кур'єру не малюється те, чого він не може", () => {
		const keys = keyboardFor('LL-ABC234', 'SHIPPED', 'COURIER').flat();

		expect(keys).toHaveLength(1);
		expect(keys[0].text).toBe('Отримано');
	});

	it('у закритому замовленні кнопок немає зовсім', () => {
		expect(keyboardFor('LL-ABC234', 'DELIVERED', 'MANAGER')).toEqual([]);
	});

	/**
	 * Головна інваріанта: усе, що намальовано, сервер приймає. Розійдуться —
	 * і менеджер тикатиме кнопку, яка мовчки нічого не робить.
	 */
	it('кожна намальована кнопка проходить перевірку сервера', () => {
		const statuses = ['NEW', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
		const roles = ['MANAGER', 'COURIER'] as const;

		for (const status of statuses) {
			for (const role of roles) {
				for (const button of keyboardFor('LL-ABC234', status, role).flat()) {
					const action = decodeAction(button.callback_data);
					expect(action).not.toBeNull();
					expect(canMove(status, action!.to, role)).toBe(true);
				}
			}
		}
	});
});
