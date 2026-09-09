import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProductInfo from './product-info.svelte';

/**
 * Опис і умови під товаром. Головне тут — опис видно одразу: він же йде
 * в розмітку сторінки, і саме його читає пошуковик. Решта згорнута, але
 * лишається в HTML — інакше пошуковик побачив би півсторінки.
 */

const description = 'Сатин зі шляхетним блиском.\nПідкладка — віскоза.';

describe('блок «Про товар»', () => {
	it('опис розгорнутий одразу, без кліку', () => {
		render(ProductInfo, { description, sku: 'OLIVIA' });

		expect(screen.getByText(/Сатин зі шляхетним блиском/)).toBeVisible();
	});

	it('решта секцій згорнута, але текст лишається в розмітці', () => {
		render(ProductInfo, { description, sku: null });

		expect(screen.getByRole('button', { name: 'Обмін і повернення' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
		// Згорнуте — не означає «немає»: пошуковик читає сторінку без кліків.
		expect(screen.getByText(/на обмін і повернення/)).toBeInTheDocument();
	});

	it('характеристики виводяться списком «назва — значення»', () => {
		render(ProductInfo, {
			description,
			attributes: [
				{ name: 'Склад', value: '95% віскоза, 5% еластан' },
				{ name: 'Країна виробництва', value: 'Україна' }
			],
			sku: null
		});

		expect(screen.getByText('Склад')).toBeInTheDocument();
		expect(screen.getByText('95% віскоза, 5% еластан')).toBeInTheDocument();
		expect(screen.getByText('Країна виробництва')).toBeInTheDocument();
		expect(screen.getByText('Україна')).toBeInTheDocument();
	});

	it('порядок такий самий, як його задала CRM', () => {
		render(ProductInfo, {
			description,
			attributes: [
				{ name: 'Догляд', value: 'Прання при 30°' },
				{ name: 'Склад', value: 'Бавовна' }
			],
			sku: null
		});

		const names = [...document.querySelectorAll('dt')].map((node) => node.textContent);
		expect(names).toEqual(['Догляд', 'Склад']);
	});

	it('без характеристик таблиці немає зовсім', () => {
		render(ProductInfo, { description, attributes: [], sku: null });

		expect(document.querySelector('dl')).toBeNull();
	});

	it('артикул показуємо тільки коли він є', async () => {
		const { unmount } = render(ProductInfo, { description, sku: 'OLIVIA' });
		expect(screen.getByText(/Артикул: OLIVIA/)).toBeInTheDocument();

		unmount();
		render(ProductInfo, { description, sku: null });
		expect(screen.queryByText(/Артикул/)).not.toBeInTheDocument();
	});

	it('опис із розмітки лишається текстом', () => {
		const attack = '<img src=x onerror="alert(1)">';
		render(ProductInfo, { description: attack, sku: null });

		expect(screen.getByText(attack)).toBeInTheDocument();
		expect(document.querySelector('img[src="x"]')).toBeNull();
	});
});
