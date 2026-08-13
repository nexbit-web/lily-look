import { describe, expect, it } from 'vitest';
import { checkoutSchema, fieldErrors, validateDelivery, type CheckoutInput } from './schemas';

/** Дані з форми — це дані з інтернету. Тут перевіряємо останню лінію оборони. */

const valid = {
	customerName: 'Олена Коваль',
	customerPhone: '+380671234567',
	customerEmail: '',
	deliveryMethod: 'NOVA_POSHTA_BRANCH',
	deliveryCity: 'Одеса',
	deliveryAddress: 'Відділення № 12',
	deliveryCityRef: 'db5c896e-391c-11dd-90d9-001a92567626',
	comment: ''
};

describe('checkoutSchema — телефон', () => {
	it('приймає тільки +380 і 9 цифр після коду', () => {
		expect(checkoutSchema.safeParse(valid).success).toBe(true);
	});

	it.each([
		['без плюса', '380671234567'],
		['локальний формат', '0671234567'],
		['із пробілами', '+380 67 123 45 67'],
		['закоротко', '+38067123456'],
		['задовго', '+3806712345678'],
		['чужа країна', '+79161234567'],
		['букви', '+38067ABCDEFG'],
		['порожньо', ''],
		['ін’єкція', "+380671234567' OR 1=1--"]
	])('відхиляє %s', (_case, phone) => {
		const result = checkoutSchema.safeParse({ ...valid, customerPhone: phone });
		expect(result.success).toBe(false);
	});
});

describe('checkoutSchema — решта полів', () => {
	it('email необов’язковий: приймає порожнє і відсутнє поле', () => {
		expect(checkoutSchema.safeParse({ ...valid, customerEmail: '' }).success).toBe(true);

		const withoutEmail = { ...valid } as Record<string, unknown>;
		delete withoutEmail.customerEmail;
		expect(checkoutSchema.safeParse(withoutEmail).success).toBe(true);
	});

	it('але кривий email не пропускає', () => {
		const result = checkoutSchema.safeParse({ ...valid, customerEmail: 'олена@' });
		expect(result.success).toBe(false);
	});

	it('обрізає пробіли навколо значень', () => {
		const result = checkoutSchema.parse({ ...valid, customerName: '  Олена Коваль  ' });
		expect(result.customerName).toBe('Олена Коваль');
	});

	it('відхиляє надто короткі й надто довгі значення', () => {
		expect(checkoutSchema.safeParse({ ...valid, customerName: 'О' }).success).toBe(false);
		expect(checkoutSchema.safeParse({ ...valid, customerName: 'О'.repeat(121) }).success).toBe(
			false
		);
		expect(checkoutSchema.safeParse({ ...valid, comment: 'a'.repeat(501) }).success).toBe(false);
	});

	it('не дає підсунути невідомий спосіб доставки', () => {
		const result = checkoutSchema.safeParse({ ...valid, deliveryMethod: 'FREE_TELEPORT' });
		expect(result.success).toBe(false);
	});

	it('не намагається «чистити» текст — екранування робить рендер', () => {
		const attack = '<script>alert(1)</script>';
		const result = checkoutSchema.parse({ ...valid, comment: attack });
		expect(result.comment).toBe(attack);
	});
});

describe('validateDelivery', () => {
	const input = (patch: Partial<CheckoutInput>) =>
		({ ...checkoutSchema.parse(valid), ...patch }) as CheckoutInput;

	it('для відділення вимагає місто й відділення', () => {
		expect(validateDelivery(input({ deliveryCity: '', deliveryAddress: '' }))).toEqual({
			deliveryCity: 'Оберіть населений пункт',
			deliveryAddress: 'Оберіть відділення'
		});
	});

	it('для кур’єра просить саме адресу', () => {
		const errors = validateDelivery(
			input({ deliveryMethod: 'NOVA_POSHTA_COURIER', deliveryAddress: '' })
		);
		expect(errors.deliveryAddress).toBe('Вкажіть адресу доставки');
	});

	it('для самовивозу не вимагає нічого', () => {
		expect(
			validateDelivery(input({ deliveryMethod: 'PICKUP', deliveryCity: '', deliveryAddress: '' }))
		).toEqual({});
	});
});

describe('fieldErrors', () => {
	it('перетворює помилки zod на словник «поле → перше повідомлення»', () => {
		const result = checkoutSchema.safeParse({ ...valid, customerName: '', customerPhone: '000' });
		expect(result.success).toBe(false);

		const errors = fieldErrors(result.error!);
		expect(Object.keys(errors)).toEqual(expect.arrayContaining(['customerName', 'customerPhone']));
		expect(errors.customerPhone).toMatch(/10 цифр/);
	});
});
