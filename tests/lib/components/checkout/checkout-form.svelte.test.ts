import { FREE_DELIVERY_FROM } from '$lib/config';
import { formatPrice } from '$lib/money';
import type { CartView } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CheckoutForm from '$lib/components/checkout/checkout-form.svelte';

/**
 * Форма оформлення: що покупець бачить у підсумку й коли його не пускають
 * далі. Відправку перехоплюємо на рівні `use:enhance` — саме там форма
 * вирішує, йти на сервер чи підсвітити поля.
 */

type Submit = (input: { cancel: () => void }) => unknown;
let submit: Submit = () => undefined;

vi.mock('$app/forms', () => ({
	enhance: (_form: HTMLFormElement, callback: Submit) => {
		submit = callback;
		return { destroy() {} };
	}
}));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('svelte-hot-french-toast', () => ({ default: { success: vi.fn(), error: toastError } }));

function cart(subtotal: number): CartView {
	return {
		id: 'cart-1',
		count: 1,
		subtotal,
		lines: [
			{
				id: 'line-1',
				variantId: 'v1',
				productName: 'Сукня міді',
				productSlug: 'suknia-midi',
				size: 'M',
				color: 'Чорний',
				imageUrl: null,
				unitPrice: subtotal,
				quantity: 1,
				lineTotal: subtotal,
				stock: 3
			}
		]
	};
}

function open(subtotal = 150_000, extra: Record<string, unknown> = {}) {
	return render(CheckoutForm, {
		cart: cart(subtotal),
		novaPoshtaLive: false,
		serverErrors: {},
		serverMessage: '',
		...extra
	});
}

/** Спроба відправки: повертає, чи форма зупинила запит. */
async function trySubmit() {
	const cancel = vi.fn();
	submit({ cancel });
	await tick();
	return cancel.mock.calls.length > 0;
}

async function fill() {
	await fireEvent.input(screen.getByLabelText(/Ім’я та прізвище/), {
		target: { value: 'Олена Коваль' }
	});
	await fireEvent.input(screen.getByLabelText(/Телефон/), { target: { value: '067 123 45 67' } });
	await fireEvent.input(screen.getByLabelText(/Місто або село/), { target: { value: 'Київ' } });
	await fireEvent.input(screen.getByLabelText(/^Відділення/), { target: { value: '№1' } });
}

beforeEach(() => {
	toastError.mockReset();
});

describe('підсумок замовлення', () => {
	it('до порогу: доставка за тарифом перевізника, до сплати — лише товари', () => {
		open(150_000);

		expect(screen.getAllByText('За тарифом перевізника').length).toBeGreaterThan(0);
		expect(screen.getByText('До сплати').nextElementSibling?.textContent).toBe(
			formatPrice(150_000)
		);
		expect(screen.getByText(/оплачуєте на пошті при отриманні/)).toBeInTheDocument();
	});

	it('від порогу: доставка безкоштовна, без приписки про тариф', () => {
		open(FREE_DELIVERY_FROM);

		expect(screen.getAllByText('Безкоштовно').length).toBeGreaterThan(0);
		expect(screen.queryByText(/оплачуєте на пошті при отриманні/)).toBeNull();
	});

	it('жодної суми доставки в гривнях — лише слова', () => {
		const { container } = open(150_000);
		const summary = container.querySelector('aside')!.textContent!;

		expect(summary).not.toMatch(/від \d+\s*грн|\b90\s*грн/);
	});
});

describe('відправка', () => {
	it('порожню форму не відправляє: поля підсвічені, тост, кнопка вимкнена', async () => {
		open();

		expect(await trySubmit()).toBe(true);
		expect(toastError).toHaveBeenCalledWith('Заповніть виділені поля');
		expect(screen.getByLabelText(/Ім’я та прізвище/)).toHaveAttribute('aria-invalid', 'true');
		expect(screen.getByText('Вкажіть номер телефону')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Підтвердити замовлення' })).toBeDisabled();
	});

	it('до спроби відправки форма не червоніє', () => {
		open();

		expect(screen.queryAllByRole('alert')).toHaveLength(0);
	});

	it('усе заповнено — іде на сервер, у форму — нормалізований телефон', async () => {
		const { container } = open();
		await fill();

		expect(await trySubmit()).toBe(false);
		expect(container.querySelector<HTMLInputElement>('input[name="customerPhone"]')?.value).toBe(
			'+380671234567'
		);
	});

	it('вставили номер з +380 — код країни не задвоюється', async () => {
		const { container } = open();

		await fireEvent.input(screen.getByLabelText(/Телефон/), {
			target: { value: '+38 (067) 123-45-67' }
		});

		expect(container.querySelector<HTMLInputElement>('input[name="customerPhone"]')?.value).toBe(
			'+380671234567'
		);
	});

	it('кривий email зупиняє, порожній — ні (поле необовʼязкове)', async () => {
		open();
		await fill();

		await fireEvent.input(screen.getByLabelText(/Email/), { target: { value: 'olena@' } });
		expect(await trySubmit()).toBe(true);

		await fireEvent.input(screen.getByLabelText(/Email/), { target: { value: '' } });
		expect(await trySubmit()).toBe(false);
	});

	it('помилка з сервера видна під полем і в підсумку', () => {
		open(150_000, {
			serverErrors: { customerPhone: 'Введіть 10 цифр номера' },
			serverMessage: '«Сукня» щойно розібрали.'
		});

		expect(screen.getByText('Введіть 10 цифр номера')).toBeInTheDocument();
		expect(screen.getByText('«Сукня» щойно розібрали.')).toBeInTheDocument();
	});
});

describe('поля', () => {
	it('кожне поле має підпис, необовʼязкові позначені', () => {
		open();

		expect(screen.getByLabelText(/Email/).closest('.field-box')?.textContent).toContain(
			'(не обов’язково)'
		);
		expect(
			screen.getByLabelText(/Ім’я та прізвище/).closest('.field-box')?.textContent
		).not.toContain('не обов’язково');
	});
});
