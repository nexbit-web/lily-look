import type { CartLine } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CartLineItem from './cart-line.svelte';

/**
 * Найтонше місце кошика: кількість міняється миттєво, а в базу їде
 * один запит на серію кліків. Тут це й перевіряємо.
 */

// Полегшена копія use:enhance: перехоплює submit і кличе наш обробник,
// не ходячи в мережу. Цього досить, щоб перевірити реакцію компонента.
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: (input: unknown) => unknown) => {
		const onsubmit = (event: Event) => {
			event.preventDefault();
			submit({ formElement: form, cancel: () => {} });
		};
		form.addEventListener('submit', onsubmit);
		return { destroy: () => form.removeEventListener('submit', onsubmit) };
	}
}));
vi.mock('svelte-hot-french-toast', () => ({
	default: { success: vi.fn(), error: vi.fn() }
}));

const line: CartLine = {
	id: 'item-1',
	variantId: 'var-1',
	productName: 'Сукня Olivia',
	productSlug: 'suknia-olivia',
	size: 'M',
	color: 'Пудровий',
	imageUrl: 'https://example.test/1.jpg',
	unitPrice: 100_000,
	quantity: 1,
	lineTotal: 100_000,
	stock: 5
};

function setup(patch: Partial<CartLine> = {}) {
	const onQuantity = vi.fn();
	const onRemove = vi.fn();
	const onSettled = vi.fn();

	render(CartLineItem, {
		line: { ...line, ...patch },
		onQuantity,
		onRemove,
		onSettled
	});

	return { onQuantity, onRemove, onSettled };
}

const plus = () => screen.getByRole('button', { name: 'Збільшити кількість' });
const minus = () => screen.getByRole('button', { name: 'Зменшити кількість' });

let requestSubmit: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.useFakeTimers();
	requestSubmit = vi
		.spyOn(HTMLFormElement.prototype, 'requestSubmit')
		.mockImplementation(() => undefined);
});

afterEach(() => {
	vi.useRealTimers();
	requestSubmit.mockRestore();
});

describe('лічильник кількості', () => {
	it('серія кліків складається в один запит із фінальною кількістю', async () => {
		const { onQuantity } = setup({ quantity: 1 });

		await fireEvent.click(plus());
		await fireEvent.click(plus());
		await fireEvent.click(plus());

		// UI реагує одразу…
		expect(onQuantity.mock.calls.map(([value]) => value)).toEqual([2, 2, 2]);
		// …а запит ще не пішов
		expect(requestSubmit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(400);
		expect(requestSubmit).toHaveBeenCalledTimes(1);
	});

	it('кожен клік перезапускає паузу, а не шле запит', async () => {
		setup({ quantity: 1 });

		await fireEvent.click(plus());
		vi.advanceTimersByTime(300);
		await fireEvent.click(plus());
		vi.advanceTimersByTime(300);
		expect(requestSubmit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(100);
		expect(requestSubmit).toHaveBeenCalledTimes(1);
	});

	it('не дає опустити кількість нижче одиниці', () => {
		setup({ quantity: 1 });
		expect(minus()).toBeDisabled();
	});

	it('не дає замовити більше, ніж є на складі', () => {
		setup({ quantity: 2, stock: 2 });

		expect(plus()).toBeDisabled();
		expect(screen.getByText('Це весь залишок')).toBeInTheDocument();
	});

	it('кнопки лишаються submit’ами — без JS форма працює сама', () => {
		setup({ quantity: 2 });

		expect(plus()).toHaveAttribute('type', 'submit');
		expect(plus()).toHaveAttribute('name', 'quantity');
		expect(plus()).toHaveAttribute('value', '3');
		expect(minus()).toHaveAttribute('value', '1');
	});
});

describe('видалення', () => {
	it('позначає рядок як такий, що видаляється', async () => {
		const { onRemove } = setup();

		await fireEvent.click(screen.getByRole('button', { name: /Видалити/ }));
		expect(onRemove).toHaveBeenCalled();
	});

	it('поки видаляється — рядок погашено й кнопки недоступні', () => {
		render(CartLineItem, {
			line,
			removing: true,
			onQuantity: vi.fn(),
			onRemove: vi.fn(),
			onSettled: vi.fn()
		});

		expect(screen.getByRole('listitem')).toHaveAttribute('aria-busy', 'true');
		expect(screen.getByRole('button', { name: /Видалити/ })).toBeDisabled();
	});
});
