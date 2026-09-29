import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import QuickOrderDialog from '$lib/components/product/quick-order-dialog.svelte';

/**
 * Вікно «Купити в 1 клік»: два поля, і покупець бачить, що саме замовляє
 * й що буде далі. Надсилання перевіряє сервер (тести action `quick`).
 */

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }), applyAction: vi.fn() }));
vi.mock('svelte-hot-french-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const props = {
	open: true,
	name: 'Зимова куртка «Nord» шоколад',
	variant: { id: 'v-m', size: 'M', color: 'Шоколад' },
	price: 287_000,
	image: 'https://res.cloudinary.com/demo/image/upload/nord.jpg'
};

describe('вікно «Купити в 1 клік»', () => {
	it('показує, що саме замовляють: назва, колір, розмір, ціна', () => {
		render(QuickOrderDialog, props);

		const dialog = screen.getByRole('dialog');
		expect(dialog).toHaveTextContent('Зимова куртка «Nord» шоколад');
		expect(dialog).toHaveTextContent('Шоколад · M');
		expect(dialog).toHaveTextContent('2 870');
	});

	it('лише два поля — ім’я й телефон, і форма веде на ?/quick з цим розміром', () => {
		render(QuickOrderDialog, props);

		const form = screen.getByRole('dialog').querySelector('form');
		expect(form).toHaveAttribute('action', '?/quick');
		expect(form?.querySelector('input[name="variantId"]')).toHaveValue('v-m');
		expect(screen.getByLabelText(/Ім’я/)).toHaveAttribute('name', 'customerName');
		expect(screen.getByLabelText(/Телефон/)).toHaveAttribute('type', 'tel');
		// Жодних міста, відділення, пошти — це й робить покупку «в 1 клік».
		expect(form?.querySelectorAll('input:not([type="hidden"])')).toHaveLength(2);
	});

	it('телефон іде на сервер у повному форматі +380…', async () => {
		render(QuickOrderDialog, props);

		await fireEvent.input(screen.getByLabelText(/Телефон/), { target: { value: '067 123 45 67' } });

		expect(document.querySelector('input[name="customerPhone"]')).toHaveValue('+380671234567');
	});

	it('каже, що буде далі: дзвінок менеджера й оплата при отриманні', () => {
		render(QuickOrderDialog, props);

		expect(screen.getByText(/Менеджер зателефонує/)).toHaveTextContent('Оплата при отриманні');
	});
});
