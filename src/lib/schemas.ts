import { z } from 'zod';
import { DELIVERY_METHODS } from './config.js';

/** Схеми валідації, спільні для сервера і клієнта. */

const deliveryValues = DELIVERY_METHODS.map((method) => method.value) as [string, ...string[]];

export const checkoutSchema = z.object({
	customerName: z
		.string()
		.trim()
		.min(2, "Вкажіть ім'я та прізвище")
		.max(120, 'Занадто довге значення'),
	// Формат жорсткий: +38 і рівно 10 цифр національного номера з нуля.
	// Поле на клієнті вже нормалізує ввід, тут — остання лінія оборони.
	customerPhone: z
		.string()
		.trim()
		.regex(/^\+380\d{9}$/, 'Введіть 10 цифр номера, наприклад 067 123 45 67'),
	// Email необов'язковий: приймаємо і порожній рядок, і повну відсутність поля.
	customerEmail: z
		.union([z.literal(''), z.email('Некоректний email')])
		.optional()
		.default(''),
	deliveryMethod: z.enum(deliveryValues),
	deliveryCity: z.string().trim().max(120).optional().default(''),
	deliveryAddress: z.string().trim().max(240).optional().default(''),
	/** Ref міста в довіднику НП. Не зберігаємо — потрібен лише для тарифу. */
	deliveryCityRef: z.string().trim().max(64).optional().default(''),
	comment: z.string().trim().max(500, 'Не більше 500 символів').optional().default('')
});

/**
 * Обов'язковість адреси залежить від способу доставки, тому перевіряємо її
 * окремо: у zod-схемі це вилилось би в нечитабельний ланцюжок refine.
 */
export function validateDelivery(input: CheckoutInput): Record<string, string> {
	const method = DELIVERY_METHODS.find((item) => item.value === input.deliveryMethod);
	if (!method || method.kind === 'pickup') return {};

	const errors: Record<string, string> = {};
	if (!input.deliveryCity) errors.deliveryCity = 'Оберіть населений пункт';
	if (!input.deliveryAddress) {
		errors.deliveryAddress =
			method.kind === 'courier' ? 'Вкажіть адресу доставки' : 'Оберіть відділення';
	}
	return errors;
}

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Плоский словник помилок `{ поле: повідомлення }` для рендеру у формі. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
	const result: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path.join('.');
		result[key] ??= issue.message;
	}
	return result;
}
