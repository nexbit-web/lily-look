import { describe, expect, it } from 'vitest';
import { modelSku } from './sku';

/**
 * Артикул моделі виводиться зі спільного початку артикулів варіантів.
 * Помилка тут не ламає сторінку — вона просто показує покупцеві не той
 * код, і менеджер шукає в CRM не ту річ.
 */
describe('артикул моделі', () => {
	it('спільна частина без хвостового дефіса', () => {
		expect(modelSku(['OLIVIA-S-PUDRA', 'OLIVIA-M-PUDRA', 'OLIVIA-L-PUDRA'])).toBe('OLIVIA');
	});

	it('різні кольори звужують код до назви моделі', () => {
		expect(modelSku(['OLIVIA-S-PUDRA', 'OLIVIA-S-ZELEN'])).toBe('OLIVIA-S');
	});

	it('єдиний варіант віддає свій артикул як є', () => {
		expect(modelSku(['OLIVIA-S-PUDRA'])).toBe('OLIVIA-S-PUDRA');
	});

	it('без варіантів показувати нічого', () => {
		expect(modelSku([])).toBeNull();
	});

	it('випадковий збіг у пару літер артикулом не вважається', () => {
		expect(modelSku(['AB-1', 'AC-2'])).toBeNull();
	});

	it('порожній артикул у CRM не ламає розрахунок', () => {
		expect(modelSku(['', 'OLIVIA-M'])).toBeNull();
	});
});
