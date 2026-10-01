import type { CartLine } from '$lib/types';
import { describe, expect, it } from 'vitest';
import { MESSAGE_LIMIT, buildOrderMessage, type OrderMessage } from '$lib/bot/order-message';

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
	deliveryCost: 0,
	total: 264_900,
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

	/**
	 * Розділи розмічені вагою тексту й порожніми рядками, а не значками:
	 * підписи лишились тільки там, де без них незрозуміло, що це за список.
	 */
	it('розділи розмічені словами й пробілом, а не значками', () => {
		const message = plain(text({ customerEmail: 'olena@example.test', comment: 'до 18:00' }));

		expect(message).toContain('Коментар покупця');
		expect(message).toContain('Зібрати');
		expect(message).toContain('Разом');
	});
});

describe('що має бути в наряді', () => {
	it('номер замовлення й київський час', () => {
		const message = plain(text());

		expect(message).toContain('Замовлення LL-ABC234');
		// 12:42 UTC у вересні — це 15:42 у Києві.
		expect(message).toContain('17 вересня');
		expect(message).toContain('15:42');
	});

	/**
	 * Номер менеджер копіює постійно — у накладну, в CRM, у розмову з
	 * покупцем. У `<code>` Telegram копіює його одним дотиком.
	 */
	it('номер загорнутий у code — щоб копіювався дотиком', () => {
		expect(text()).toContain('<code>LL-ABC234</code>');
	});

	it('стан замовлення видно в шапці', () => {
		const message = plain(text({ status: 'Відправлене' }));

		expect(message).toContain('Відправлене · 17 вересня');
	});

	it('хто змінив стан — окремим рядком, і тільки коли є що сказати', () => {
		expect(plain(text({ changedBy: 'Олена · 18 вересня 10:12' }))).toContain(
			'Олена · 18 вересня 10:12'
		);
		expect(plain(text())).not.toContain('·  ');
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
		expect(message).toContain('Пудровий · M · ×2 · 5 298 грн');
	});

	it('кількість пишемо навіть коли вона одна — зібрати не те дорожче', () => {
		expect(plain(text())).toContain('×1');
	});

	/** Назву шукають очима першою, тож вона одна в позиції жирна. */
	it('назва позиції виділена, ознаки — ні', () => {
		const message = text();

		expect(message).toContain('<b>Сатинова сукня Olivia</b>');
		expect(message).not.toContain('<b>Пудровий');
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

		expect(message).toContain('Товари · 2 649 грн');
		expect(message).toContain('Доставка · за тарифом перевізника, платить отримувач');
		expect(message).toContain('Разом · 2 649 грн');
		expect(message).toContain('Оплата при отриманні');
	});

	/** Підсумок — єдине число, яке шукають очима, тож воно одне й жирне. */
	it('виділений лише підсумок, не кожен рядок сум', () => {
		const message = text();

		// Ціни містять нерозривні пробіли, тож звіряємось із розміткою, а не
		// з точним написанням суми — її перевіряє тест вище.
		expect(message).toMatch(/<b>Разом · .+<\/b>/);
		expect(message).not.toContain('<b>Товари');
	});

	/** Менеджеру це вказівка для накладної: хто платник доставки. */
	it('від порогу доставка безкоштовна — і видно, що платить магазин', () => {
		expect(plain(text({ subtotal: 450_000, total: 450_000 }))).toContain(
			'Доставка · безкоштовно, платить магазин'
		);
	});

	it('самовивіз — просто безкоштовно, платити нікому', () => {
		const message = plain(text({ method: 'PICKUP' }));

		expect(message).toContain('Доставка · безкоштовно');
		expect(message).not.toContain('платить');
	});

	it('старе замовлення з сумою доставки показує ту суму, яку бачив покупець', () => {
		expect(plain(text({ deliveryCost: 9800, total: 274_700 }))).toContain('Доставка · 98 грн');
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

		expect(message).toMatch(/та ще \d+ позиц/);
		// Суми й підпис мають лишитись — це те, без чого наряд марний.
		expect(message).toContain('Разом ·');
		expect(message).toContain('Оплата при отриманні');
	});

	/** «81 позиція», а не «81 позицій»: число тут пишуть українською. */
	it('число позицій узгоджене з формою слова', () => {
		const message = plain(text({ lines: many.slice(0, 43) }));
		const match = message.match(/та ще (\d+) (позиц\S+)/);

		expect(match).not.toBeNull();
		const [, count, form] = match!;
		if (Number(count) % 10 === 1 && Number(count) % 100 !== 11) {
			expect(form).toBe('позиція');
		}
	});

	it('коротке замовлення не ріже нічого', () => {
		expect(plain(text())).not.toContain('та ще');
	});
});

describe('замовлення в 1 клік', () => {
	it('видно з першого рядка — саме його Telegram показує у сповіщенні', () => {
		const [first] = text({ city: '', address: '' }).split('\n');

		expect(plain(first)).toBe('Замовлення в 1 клік LL-ABC234');
	});

	it('менеджер бачить, що треба передзвонити й що саме уточнити', () => {
		const message = plain(text({ city: '', address: '' }));

		expect(message).toContain('Передзвоніть покупцю');
		expect(message).toContain('Уточніть розмір, місто й відділення Нової Пошти');
		expect(message).not.toContain('Нова Пошта — відділення');
		// Телефон — посиланням, щоб набрати одним дотиком.
		expect(text({ city: '', address: '' })).toContain('href="tel:+380671234567"');
	});

	it('звичайне замовлення з адресою — як і було', () => {
		const message = plain(text());

		expect(message.startsWith('Замовлення LL-ABC234')).toBe(true);
		expect(message).toContain('Нова Пошта — відділення');
		expect(message).not.toContain('Передзвоніть');
	});

	it('менеджер уточнив адресу в CRM — картка стає звичайною', () => {
		const message = plain(text({ city: 'Київ', address: 'Відділення № 5' }));

		expect(message).not.toContain('в 1 клік');
		expect(message).toContain('Київ, Відділення № 5');
	});

	it('самовивіз без адреси — не «в 1 клік»: адреса йому й не потрібна', () => {
		expect(plain(text({ method: 'PICKUP', city: '', address: '' }))).not.toContain('в 1 клік');
	});
});

describe('приз колеса фортуни', () => {
	it('безкоштовна доставка — менеджер бачить, що платить магазин', () => {
		const message = plain(
			text({ prize: 'Безкоштовна доставка', prizeDiscount: 0, prizeFreeDelivery: true })
		);

		expect(message).toContain('🎁 Безкоштовна доставка з колеса');
		expect(message).toContain('безкоштовно, платить магазин');
	});

	it('знижка — рядком у сумі, разом уже з нею', () => {
		const message = plain(
			text({ prize: 'Знижка 7%', prizeDiscount: 22_400, subtotal: 319_800, total: 297_400 })
		);

		expect(message).toMatch(/🎁 Знижка 7% з колеса · −224\sгрн/);
		expect(message).not.toContain('Безкоштовна доставка з колеса');
	});

	it('без приза — жодного згадування', () => {
		expect(plain(text())).not.toContain('🎁');
	});
});
