import type { CartLine } from '$lib/types';
import { describe, expect, it } from 'vitest';
import { MESSAGE_LIMIT, buildOrderMessage, type OrderMessage } from './order-message.js';

/**
 * Повідомлення про замовлення — це наряд на збірку, який менеджер читає
 * з телефона. Тому перевіряємо дві речі: що в ньому є все потрібне для
 * збірки й дзвінка, і що в ньому немає нічого зайвого — жодної картинки,
 * жодної оздоби.
 */

const line = (patch: Partial<CartLine> = {}): CartLine => ({
	id: 'item-1',
	variantId: 'var-1',
	productName: 'Сатинова сукня Olivia',
	productSlug: 'suknia-olivia',
	size: 'M',
	color: 'Пудровий',
	imageUrl: null,
	unitPrice: 264_900,
	quantity: 1,
	lineTotal: 264_900,
	stock: 5,
	...patch
});

const order = (patch: Partial<OrderMessage> = {}): OrderMessage => ({
	number: 'LL-ABC234',
	customerName: 'Олена Коваль',
	customerPhone: '+380671234567',
	customerEmail: null,
	method: 'NOVA_POSHTA_BRANCH',
	city: 'Одеса',
	address: 'Відділення № 12',
	comment: '',
	lines: [line()],
	subtotal: 264_900,
	deliveryCost: 9800,
	total: 274_700,
	payment: 'Оплата при отриманні',
	// Час фіксований, щоб перевіряти формат, а не годинник машини.
	now: new Date('2026-09-17T12:42:00Z'),
	...patch
});

const text = (patch: Partial<OrderMessage> = {}) => buildOrderMessage(order(patch));
const plain = (value: string) => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

describe('без оздоби', () => {
	it('жодного емодзі — ні в заголовку, ні в розділах', () => {
		const message = text({
			customerEmail: 'olena@example.test',
			comment: 'Дзвоніть після 18:00',
			orderUrl: 'https://lilylook.store/order/LL-ABC234'
		});

		expect(message).not.toMatch(/\p{Extended_Pictographic}/u);
	});

	it('розділи підписані словами, а не значками', () => {
		const message = plain(text({ customerEmail: 'olena@example.test', comment: 'до 18:00' }));

		expect(message).toContain('Покупець');
		expect(message).toContain('Доставка');
		expect(message).toContain('Товари');
		expect(message).toContain('Коментар покупця');
	});
});

describe('що має бути в наряді', () => {
	it('номер замовлення, магазин і київський час', () => {
		const message = plain(text());

		expect(message).toContain('Замовлення LL-ABC234');
		expect(message).toContain('LILY LOOK');
		// 12:42 UTC у вересні — це 15:42 у Києві.
		expect(message).toContain('17 вересня');
		expect(message).toContain('15:42');
	});

	it('покупець і телефон посиланням — щоб набрати одним дотиком', () => {
		const message = text({ customerEmail: 'olena@example.test' });

		expect(message).toContain('Олена Коваль');
		expect(message).toContain('<a href="tel:+380671234567">+380671234567</a>');
		expect(message).toContain('olena@example.test');
	});

	it('спосіб доставки й куди везти', () => {
		const message = plain(text());

		expect(message).toContain('Нова Пошта — відділення');
		expect(message).toContain('Одеса, Відділення № 12');
	});

	it('позиція: назва, колір, розмір, кількість, сума', () => {
		const message = plain(text({ lines: [line({ quantity: 2, lineTotal: 529_800 })] }));

		expect(message).toContain('1. Сатинова сукня Olivia');
		expect(message).toContain('Пудровий · M · 2 шт · 5 298 грн');
	});

	it('кількість пишемо навіть коли вона одна — зібрати не те дорожче', () => {
		expect(plain(text())).toContain('1 шт');
	});

	it('позиції нумеруються — так їх легше відмічати на полиці', () => {
		const message = plain(
			text({ lines: [line(), line({ id: 'item-2', productName: 'Куртка-вітровка' })] })
		);

		expect(message).toContain('1. Сатинова сукня Olivia');
		expect(message).toContain('2. Куртка-вітровка');
	});

	it('суми й спосіб оплати', () => {
		const message = plain(text());

		expect(message).toContain('Сума: 2 649 грн');
		expect(message).toContain('Доставка: 98 грн');
		expect(message).toContain('Разом: 2 747 грн');
		expect(message).toContain('Оплата при отриманні');
	});

	it('безкоштовну доставку називаємо словом, а не нулем', () => {
		expect(plain(text({ deliveryCost: 0 }))).toContain('Доставка: безкоштовно');
	});

	it('посилання на замовлення, якщо воно відоме', () => {
		const url = 'https://lilylook.store/order/LL-ABC234';

		expect(text({ orderUrl: url })).toContain(url);
		expect(text()).not.toContain('/order/');
	});
});

describe('чого не має бути', () => {
	it('порожнього розділу з коментарем', () => {
		expect(plain(text())).not.toContain('Коментар');
	});

	it('рядка з поштою, якої покупець не залишив', () => {
		expect(text()).not.toContain('@');
	});
});

describe('дані покупця не ламають розмітку', () => {
	it('кутові дужки, амперсанд і лапки екрануються', () => {
		const message = text({
			customerName: '<b>Олена</b> & Ко',
			comment: '<a href="evil">клік</a>'
		});

		expect(message).toContain('&lt;b&gt;Олена&lt;/b&gt; &amp; Ко');
		expect(message).toContain('&quot;evil&quot;');
		expect(message).not.toContain('<b>Олена');
	});
});

describe('довге замовлення', () => {
	const many = Array.from({ length: 120 }, (_, index) =>
		line({
			id: `item-${index}`,
			productName: `Сукня довгої назви для перевірки межі номер ${index}`
		})
	);

	it('вкладається в межу Telegram', () => {
		expect(text({ lines: many }).length).toBeLessThanOrEqual(MESSAGE_LIMIT);
	});

	it('ріже список позицій і каже, скільки лишилось за посиланням', () => {
		const message = plain(text({ lines: many }));

		expect(message).toMatch(/та ще \d+ позицій/);
		// Суми й підпис мають лишитись — це те, без чого наряд марний.
		expect(message).toContain('Разом:');
		expect(message).toContain('Оплата при отриманні');
	});

	it('коротке замовлення не ріже нічого', () => {
		expect(plain(text())).not.toContain('та ще');
	});
});
