import type { ProductMeasurementView } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SizeChartDialog from '$lib/components/product/size-chart-dialog.svelte';

/**
 * Таблиця розмірів будується з бази, а не з довідника в коді. Тому головне
 * тут — що в ній рівно ті розміри, які CRM записала товару, у тому ж
 * порядку, і жодного зайвого стовпчика.
 */

const measurement = (patch: Partial<ProductMeasurementView>): ProductMeasurementView => ({
	size: 'M',
	ua: '46',
	chest: 92,
	sleeve: 60,
	length: 94,
	...patch
});

const open = async () => {
	await fireEvent.click(screen.getByRole('button', { name: 'Таблиця розмірів' }));
	return screen.findByRole('dialog');
};

const columnTitles = () =>
	[...document.querySelectorAll('th')].map((cell) => cell.textContent?.trim());

const sizes = () =>
	[...document.querySelectorAll('tbody tr td:first-child')].map((cell) => cell.textContent?.trim());

describe('таблиця розмірів', () => {
	it('показує саме ті розміри, що прийшли з бази', async () => {
		render(SizeChartDialog, {
			measurements: [measurement({ size: 'S/M', ua: '42' }), measurement({ size: '6XL', ua: '62' })]
		});
		await open();

		// Ані XS, ані XL — тільки те, що є в товару, і в порядку CRM.
		expect(sizes()).toEqual(['S/M', '6XL']);
	});

	it('порожні заміри не дають зайвого стовпчика', async () => {
		render(SizeChartDialog, {
			measurements: [
				measurement({ size: 'M', sleeve: null, chest: null, length: 57 }),
				measurement({ size: 'L', sleeve: null, chest: null, length: 59 })
			]
		});
		await open();

		expect(columnTitles()).toEqual(['Розмір', 'UA', 'Довжина']);
	});

	it('колонка лишається, якщо значення є хоча б в одному рядку', async () => {
		render(SizeChartDialog, {
			measurements: [measurement({ size: 'M', chest: null }), measurement({ size: 'L', chest: 97 })]
		});
		await open();

		expect(columnTitles()).toContain('Груди');
		// Порожню клітинку показуємо прочерком, а не порожнечею.
		expect(screen.getByText('—')).toBeInTheDocument();
	});

	it('обраний розмір підсвічено — по ньому й звіряються', async () => {
		render(SizeChartDialog, {
			measurements: [measurement({ size: 'M' }), measurement({ size: 'L' })],
			selectedSize: 'L'
		});
		await open();

		const rows = [...document.querySelectorAll('tbody tr')];
		expect(rows[1].className).toMatch(/bg-brand-soft/);
		expect(rows[0].className).not.toMatch(/bg-brand-soft/);
	});
});
