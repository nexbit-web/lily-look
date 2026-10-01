import {
	DELIVERY_METHODS,
	FREE_DELIVERY_FROM,
	isDeliveryFree,
	RETURN_DAYS,
	SENDER,
	type DeliveryMethodValue
} from '$lib/config';
import { DISPATCH_CUTOFF_HOUR } from '$lib/delivery-estimate';
import { formatPrice } from '$lib/money';
import { plural } from '$lib/plural';

/**
 * Умови магазину людською мовою — одним списком на весь сайт.
 *
 * Їх читають сторінки «Доставка», «Повернення», «Контакти» і llms.txt для
 * ІІ-асистентів. Якщо кожне місце складало б речення саме, рано чи пізно
 * на одній сторінці лишилось би «90 грн», а на іншій уже «95», — і
 * асистент упевнено процитував би покупцеві стару ціну.
 *
 * Самі числа тут не живуть: вони в `config.ts`. Тут тільки те, як їх
 * сказати.
 */

export function daysLabel(days: number): string {
	return `${days} ${plural(days, 'день', 'дні', 'днів')}`;
}

/** «1–3 дні», «2–5 днів», «у день замовлення». */
function transit([from, to]: readonly [number, number]): string {
	if (to === 0) return 'у день звернення';
	if (from === to) return daysLabel(to);
	return `${from}–${daysLabel(to)}`;
}

export type DeliveryTerm = {
	label: string;
	price: string;
	time: string;
};

/**
 * Ціна доставки, яку платить покупець перевізнику. Суми сайт не називає —
 * чому, див. `isDeliveryFree` у config.
 */
export const CARRIER_TARIFF = 'за тарифом перевізника';

/** Кожен спосіб доставки з ціною й строком — для таблиці й для llms.txt. */
export function deliveryTerms(): DeliveryTerm[] {
	return DELIVERY_METHODS.map((method) => ({
		label: method.label,
		price: method.kind === 'pickup' ? 'безкоштовно' : CARRIER_TARIFF,
		time: method.kind === 'pickup' ? SENDER.pickupHours : transit(method.days)
	}));
}

export const FACTS = {
	carrierTariff: `Доставку оплачуєте на пошті при отриманні — ${CARRIER_TARIFF}. Від ${formatPrice(FREE_DELIVERY_FROM)} її оплачуємо ми.`,
	freeDelivery: `Безкоштовна доставка будь-яким способом — для замовлень від ${formatPrice(FREE_DELIVERY_FROM)}.`,
	dispatch: `Замовлення, оформлене до ${DISPATCH_CUTOFF_HOUR}:00 за київським часом, відправляємо того ж дня; пізніше — наступного.`,
	origin: `Посилки їдуть із м. ${SENDER.city} (${SENDER.region}) по всій Україні.`,
	payment:
		'Оплата при отриманні: на відділенні або кур’єру, після того як оглянете замовлення. Передоплата не потрібна.',
	returns: `Обмін і повернення — ${daysLabel(RETURN_DAYS)} з дня отримання.`,
	pickup: `Самовивіз: ${SENDER.pickupAddress}, ${SENDER.pickupHours}.`
} as const;

/**
 * Доставка в підсумку замовлення: «Безкоштовно» або «За тарифом перевізника».
 *
 * `deliveryCost` більше нуля — лише в замовленнях, оформлених ще тоді, коли
 * сайт рахував суму доставки сам: їм лишаємо ту суму, яку покупець бачив.
 * Нові замовлення зберігають нуль, а безкоштовна доставка чи ні — видно зі
 * способу й суми. Поріг береться поточний: змінять поріг — картка старого
 * замовлення покаже вже нове правило, тож поріг краще не міняти посеред
 * відкритих замовлень.
 */
export function deliveryPriceLabel(order: {
	method: DeliveryMethodValue;
	subtotal: number;
	deliveryCost: number;
	/** Безкоштовну доставку виграно в колесі фортуни. */
	prizeFreeDelivery?: boolean;
}): string {
	if (order.deliveryCost > 0) return formatPrice(order.deliveryCost);
	return isDeliveryFree(order.method, order.subtotal, order.prizeFreeDelivery)
		? 'Безкоштовно'
		: 'За тарифом перевізника';
}

/**
 * Посилання для дзвінка. Номер у налаштуваннях записаний для очей —
 * «+38 (067) …», а в `tel:` мають бути тільки цифри з плюсом попереду:
 * без плюса телефон набирає номер як місцевий і не додзвонюється.
 */
export function telHref(phone: string): string {
	return `tel:+${phone.replace(/\D/g, '')}`;
}
