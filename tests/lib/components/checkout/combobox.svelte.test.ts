import type { AutocompleteOption } from '$lib/types';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Combobox from '$lib/components/checkout/combobox.svelte';

/**
 * Поле з підказками Нової Пошти: друкуєш прямо в ньому, список — під ним.
 * У форму йде лише обране зі списку, бо надрукованого від руки довідник
 * не знає.
 */

const kyiv: AutocompleteOption = { ref: 'kyiv', label: 'Київ', hint: 'Київська обл.' };
const kyivska: AutocompleteOption = { ref: 'kyivets', label: 'Київець', hint: 'Львівська обл.' };

let search: ReturnType<typeof vi.fn<(query: string) => Promise<AutocompleteOption[]>>>;

function open(props: Record<string, unknown> = {}) {
	const result = render(Combobox, {
		id: 'settlement',
		name: 'deliveryCity',
		placeholder: 'Почніть вводити',
		search,
		...props
	});
	const input = screen.getByRole('combobox');
	const hidden = () =>
		result.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value;
	return { ...result, input, hidden };
}

/** Надрукувати й дочекатися підказок (затримка перед запитом — 250 мс). */
async function type(input: HTMLElement, value: string) {
	await fireEvent.focus(input);
	await fireEvent.input(input, { target: { value } });
	await vi.advanceTimersByTimeAsync(300);
}

beforeEach(() => {
	vi.useFakeTimers();
	search = vi
		.fn<(query: string) => Promise<AutocompleteOption[]>>()
		.mockResolvedValue([kyiv, kyivska]);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('поле з підказками', () => {
	it('друкуєш у самому полі — підказки випадають під ним', async () => {
		const { input } = open();

		await type(input, 'киї');

		expect(search).toHaveBeenCalledWith('киї');
		expect(screen.getByRole('listbox')).toBeInTheDocument();
		expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
			expect.stringContaining('Київ'),
			expect.stringContaining('Київець')
		]);
		expect(input).toHaveAttribute('aria-expanded', 'true');
	});

	it('тап по підказці: назва в полі, у форму — вона ж, список закрито', async () => {
		const { input, hidden } = open();
		await type(input, 'киї');

		await fireEvent.click(screen.getByRole('option', { name: /^Київ\s/ }));

		expect(input).toHaveValue('Київ');
		expect(hidden()).toBe('Київ');
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('одна літера — у довідник не ходимо, просимо друкувати далі', async () => {
		const { input } = open();

		await type(input, 'к');

		expect(search).not.toHaveBeenCalled();
		expect(screen.getByText('Почніть вводити назву')).toBeInTheDocument();
	});

	it('почав правити обране — у форму нічого не йде, поки не оберуть знову', async () => {
		const { input, hidden } = open({ selected: kyiv });
		expect(input).toHaveValue('Київ');

		await type(input, 'Київс');

		expect(hidden()).toBe('');
		expect(input).toHaveValue('Київс');
	});

	it('стрілка вниз і Enter обирають підказку, а форму не відправляють', async () => {
		const { input, hidden } = open();
		await type(input, 'киї');

		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		input.dispatchEvent(enter);
		await tick();

		expect(enter.defaultPrevented).toBe(true);
		expect(hidden()).toBe('Київець');
	});

	it('Escape ховає список', async () => {
		const { input } = open();
		await type(input, 'киї');

		await fireEvent.keyDown(input, { key: 'Escape' });

		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('відділення: список одразу у фокусі, друкувати не обов’язково', async () => {
		const { input } = open({ minChars: 0 });

		await fireEvent.focus(input);
		await vi.advanceTimersByTimeAsync(0);

		expect(search).toHaveBeenCalledWith('');
		expect(screen.getAllByRole('option')).toHaveLength(2);
	});

	it('довідник нічого не знайшов — так і кажемо', async () => {
		search.mockResolvedValue([]);
		const { input } = open({ emptyText: 'Такого населеного пункту немає' });

		await type(input, 'ххх');

		expect(screen.getByText('Такого населеного пункту немає')).toBeInTheDocument();
	});

	it('Нова Пошта не відповідає — видно помилку, а не порожнечу', async () => {
		search.mockRejectedValue(new Error('Сервіс Нової Пошти недоступний'));
		const { input } = open();

		await type(input, 'киї');

		expect(screen.getByRole('alert')).toHaveTextContent('Сервіс Нової Пошти недоступний');
	});

	it('скинули вибір ззовні (змінили місто) — поле порожніє', async () => {
		const { input, rerender } = open({ selected: kyiv });

		await rerender({ selected: null });

		expect(input).toHaveValue('');
	});

	it('без міста відділення вибрати не можна', () => {
		const { input } = open({ disabled: true });

		expect(input).toBeDisabled();
	});

	it('поле — того ж класу, що й решта форми: 17 px, iPhone не збільшує сторінку', () => {
		const { input } = open();

		expect(input).toHaveClass('field-input');
		expect(input).toHaveAttribute('autocomplete', 'off');
	});
});
