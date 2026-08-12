/**
 * Шар оплати навмисно абстрактний.
 *
 * Зараз працює єдиний провайдер — "manual" (оплата при отриманні).
 * Щоб підключити Stripe / LiqPay / Fondy, достатньо реалізувати
 * PaymentProvider і зареєструвати його — решта коду не змінюється.
 */

export type PayableOrder = {
	id: string;
	number: string;
	/** Сума в копійках. */
	total: number;
	customerName: string;
	customerEmail: string | null;
};

export type PaymentIntent = {
	/** Куди відправити клієнта далі. null — оплата не потрібна онлайн. */
	redirectUrl: string | null;
	/** Ідентифікатор транзакції у провайдера, якщо він його вже видав. */
	reference: string | null;
};

export interface PaymentProvider {
	readonly id: string;
	readonly label: string;
	readonly hint: string;
	createPayment(order: PayableOrder): Promise<PaymentIntent>;
}

export const DEFAULT_PAYMENT_PROVIDER = 'manual';

const manualProvider: PaymentProvider = {
	id: 'manual',
	label: 'Оплата при отриманні',
	hint: 'Менеджер зателефонує для підтвердження замовлення',
	async createPayment() {
		return { redirectUrl: null, reference: null };
	}
};

const providers = new Map<string, PaymentProvider>([[manualProvider.id, manualProvider]]);

export function registerPaymentProvider(provider: PaymentProvider): void {
	providers.set(provider.id, provider);
}

export function getPaymentProvider(id: string = DEFAULT_PAYMENT_PROVIDER): PaymentProvider {
	return providers.get(id) ?? manualProvider;
}

export function listPaymentProviders(): PaymentProvider[] {
	return [...providers.values()];
}
