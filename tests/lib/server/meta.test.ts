import type { Cookies } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Події для реклами Meta. Головне: без ключів — нічого; з ключами —
 * покупець ні на мілісекунду не чекає Meta; особисте йде лише гешем, а
 * токен не світиться в адресі запиту.
 */

const env: Record<string, string | undefined> = {};
const findMany = vi.fn();
const fetchMock = vi.fn();

vi.mock('$env/dynamic/private', () => ({ env }));
vi.mock('$lib/server/db', () => ({ db: { product: { findMany } } }));
vi.stubGlobal('fetch', fetchMock);

const {
	CLICK_COOKIE,
	domainVerification,
	flushMeta,
	isMetaConfigured,
	metaAddToCart,
	metaPurchase,
	metaView,
	normalizeCity,
	pendingMeta,
	rememberAdClick,
	splitName
} = await import('$lib/server/meta');

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const visitor = { id: 'abc123def456ghi789jk', source: 'facebook', device: 'mobile' } as const;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) [FBAN/FBIOS]';

function jar(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	const set = vi.fn((name: string, value: string) => void store.set(name, value));
	const cookies = { get: (name: string) => store.get(name), set } as unknown as Cookies;
	return { cookies, set };
}

function request(
	url: string,
	{
		cookies = jar().cookies,
		headers = { 'user-agent': IPHONE, 'x-forwarded-for': '93.170.1.2, 10.0.0.1' }
	}: { cookies?: Cookies; headers?: Record<string, string> } = {}
) {
	return {
		url: new URL(url),
		cookies,
		request: new Request(url, { headers }),
		getClientAddress: () => '127.0.0.1'
	};
}

/** Тіло останнього запиту в Meta. */
function sent() {
	const [address, init] = fetchMock.mock.calls.at(-1)!;
	return { address: String(address), body: JSON.parse(init.body) };
}

beforeEach(async () => {
	env.META_PIXEL_ID = '869971952778217';
	env.META_CAPI_TOKEN = 'EAAtesttoken0123456789';
	env.META_TEST_EVENT_CODE = undefined;
	env.META_DOMAIN_VERIFICATION = undefined;
	fetchMock.mockReset().mockResolvedValue(new Response('{"events_received":1}'));
	findMany.mockReset().mockResolvedValue([]);
	await flushMeta();
	fetchMock.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('без ключів', () => {
	it.each([
		['немає токена', '869971952778217', undefined],
		['заглушка замість токена', '869971952778217', 'сюди_вставте_токен'],
		['ID не цифрами', 'LILY LOOK', 'EAAtesttoken0123456789']
	])('%s — вимкнено', (_case, pixel, token) => {
		env.META_PIXEL_ID = pixel;
		env.META_CAPI_TOKEN = token;

		expect(isMetaConfigured()).toBe(false);
	});

	it('нічого не збирається, не шлеться і не ставиться', async () => {
		env.META_CAPI_TOKEN = undefined;
		const { cookies, set } = jar();

		rememberAdClick(request('https://lilylook.store/?fbclid=abc', { cookies }));
		metaView(request('https://lilylook.store/'), visitor, new URL('https://lilylook.store/'));
		await flushMeta();

		expect(set).not.toHaveBeenCalled();
		expect(pendingMeta()).toHaveLength(0);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('клік по рекламі', () => {
	it('fbclid запам’ятовується у форматі Meta на 90 днів', () => {
		const { cookies, set } = jar();

		rememberAdClick(
			request('https://lilylook.store/product/palto?fbclid=IwAR0abc-_1', { cookies })
		);

		expect(set).toHaveBeenCalledWith(
			CLICK_COOKIE,
			expect.stringMatching(/^fb\.1\.\d{13}\.IwAR0abc-_1$/),
			expect.objectContaining({ httpOnly: true, secure: true, maxAge: 90 * 24 * 60 * 60 })
		);
	});

	it('той самий клік удруге (оновили сторінку) — час першого заходу не зсувається', () => {
		const { cookies, set } = jar({ [CLICK_COOKIE]: 'fb.1.1700000000000.abc' });

		rememberAdClick(request('https://lilylook.store/?fbclid=abc', { cookies }));

		expect(set).not.toHaveBeenCalled();
	});

	it('без fbclid або з підробленим — нічого', () => {
		const { cookies, set } = jar();

		rememberAdClick(request('https://lilylook.store/', { cookies }));
		rememberAdClick(request('https://lilylook.store/?fbclid=%3Cscript%3E', { cookies }));

		expect(set).not.toHaveBeenCalled();
	});
});

describe('які події', () => {
	it('головна — лише PageView', () => {
		metaView(request('https://lilylook.store/'), visitor, new URL('https://lilylook.store/'));

		expect(pendingMeta().map((event) => event.name)).toEqual(['PageView']);
	});

	it('товар — ще й ViewContent з адресою товару', () => {
		const page = new URL('https://lilylook.store/product/palto?fbclid=x');
		metaView(request(page.href), visitor, page);

		expect(pendingMeta().map((event) => event.name)).toEqual(['PageView', 'ViewContent']);
		expect(pendingMeta()[1]).toMatchObject({
			url: 'https://lilylook.store/product/palto',
			items: [{ slug: 'palto', quantity: 1 }]
		});
	});

	it('оформлення — InitiateCheckout', () => {
		const page = new URL('https://lilylook.store/checkout');
		metaView(request(page.href), visitor, page);

		expect(pendingMeta().map((event) => event.name)).toEqual(['PageView', 'InitiateCheckout']);
	});

	it('подія лише лягає в пам’ять — у Meta ніхто не чекає', () => {
		metaAddToCart(request('https://lilylook.store/product/palto'), visitor, {
			slug: 'palto',
			name: 'Пальто',
			unitPrice: 264900,
			quantity: 1
		});

		expect(fetchMock).not.toHaveBeenCalled();
		expect(pendingMeta()).toHaveLength(1);
	});
});

describe('відправка', () => {
	it('усе накопичене — одним запитом, токен у тілі, а не в адресі', async () => {
		metaView(request('https://lilylook.store/'), visitor, new URL('https://lilylook.store/'));
		metaAddToCart(request('https://lilylook.store/product/palto'), visitor, {
			slug: 'palto',
			name: 'Пальто',
			unitPrice: 264900,
			quantity: 2
		});

		await flushMeta();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const { address, body } = sent();
		expect(address).toBe('https://graph.facebook.com/v23.0/869971952778217/events');
		expect(address).not.toContain('EAA');
		expect(body.access_token).toBe('EAAtesttoken0123456789');
		expect(body.test_event_code).toBeUndefined();
		expect(body.data.map((event: { event_name: string }) => event.event_name)).toEqual([
			'PageView',
			'AddToCart'
		]);
		expect(body.data[1]).toMatchObject({
			action_source: 'website',
			event_source_url: 'https://lilylook.store/product/palto',
			custom_data: {
				currency: 'UAH',
				value: 5298,
				content_type: 'product_group',
				content_ids: ['palto'],
				contents: [{ id: 'palto', quantity: 2, item_price: 2649 }],
				num_items: 2
			}
		});
		expect(pendingMeta()).toHaveLength(0);
	});

	it('ціна переглянутого товару підтягується з бази — одним запитом на всю пачку', async () => {
		findMany.mockResolvedValue([{ slug: 'palto', name: 'Пальто', finalPrice: 264900 }]);
		const page = new URL('https://lilylook.store/product/palto');
		metaView(request(page.href), visitor, page);
		metaView(request(page.href), visitor, page);

		await flushMeta();

		expect(findMany).toHaveBeenCalledTimes(1);
		expect(findMany.mock.calls[0][0].where).toEqual({ slug: { in: ['palto'] } });
		const views = sent().body.data.filter(
			(event: { event_name: string }) => event.event_name === 'ViewContent'
		);
		expect(views).toHaveLength(2);
		expect(views[0].custom_data).toMatchObject({ value: 2649, content_name: 'Пальто' });
	});

	it('хто це — IP з проксі, браузер, клік по рекламі й мітка гешем', async () => {
		const cookies = jar({ [CLICK_COOKIE]: 'fb.1.1700000000000.abc' }).cookies;
		metaView(
			request('https://lilylook.store/', { cookies }),
			visitor,
			new URL('https://lilylook.store/')
		);

		await flushMeta();

		expect(sent().body.data[0].user_data).toEqual({
			client_ip_address: '93.170.1.2',
			client_user_agent: IPHONE,
			fbc: 'fb.1.1700000000000.abc',
			external_id: [sha(visitor.id)]
		});
	});

	it('адреса самого сервера (без проксі) — не IP покупця', async () => {
		metaView(
			request('https://lilylook.store/', { headers: { 'user-agent': IPHONE } }),
			visitor,
			new URL('https://lilylook.store/')
		);

		await flushMeta();

		expect(sent().body.data[0].user_data.client_ip_address).toBeUndefined();
	});

	it('покупка: номер замовлення — id події, особисте — лише гешем', async () => {
		metaPurchase(
			request('https://lilylook.store/checkout'),
			visitor,
			{
				number: 'LL-ABC234',
				items: [{ slug: 'palto', name: 'Пальто', unitPrice: 264900, quantity: 1 }]
			},
			{
				customerName: 'Олена Коваль',
				customerPhone: '+380671234567',
				customerEmail: 'Olena@Example.com ',
				deliveryCity: 'м. Київ, Київська обл.'
			}
		);

		await flushMeta();

		const { body } = sent();
		const [purchase] = body.data;
		expect(purchase).toMatchObject({
			event_name: 'Purchase',
			event_id: 'LL-ABC234',
			custom_data: { value: 2649, order_id: 'LL-ABC234' }
		});
		expect(purchase.user_data).toMatchObject({
			ph: [sha('380671234567')],
			em: [sha('olena@example.com')],
			fn: [sha('олена')],
			ln: [sha('коваль')],
			ct: [sha('київ')],
			country: [sha('ua')]
		});
		const raw = JSON.stringify(body);
		for (const secret of ['380671234567', 'Олена', 'Коваль', 'Olena', 'Київ']) {
			expect(raw).not.toContain(secret);
		}
	});

	it('код тестових подій — лише коли заданий', async () => {
		env.META_TEST_EVENT_CODE = 'TEST12345';
		metaView(request('https://lilylook.store/'), visitor, new URL('https://lilylook.store/'));

		await flushMeta();

		expect(sent().body.test_event_code).toBe('TEST12345');
	});

	it('Meta відмовила або мережа лягла — сайт працює далі, пишеться в журнал', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		fetchMock.mockResolvedValueOnce(
			new Response('{"error":{"message":"Invalid token"}}', { status: 400 })
		);
		metaView(request('https://lilylook.store/'), visitor, new URL('https://lilylook.store/'));
		await expect(flushMeta()).resolves.toBeUndefined();

		fetchMock.mockRejectedValueOnce(new Error('ETIMEDOUT'));
		metaView(request('https://lilylook.store/'), visitor, new URL('https://lilylook.store/'));
		await expect(flushMeta()).resolves.toBeUndefined();

		expect(log).toHaveBeenCalledTimes(2);
		expect(String(log.mock.calls[0][0])).toContain('Invalid token');
	});

	it('база не віддала ціни — подія все одно йде, без суми', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		findMany.mockRejectedValue(new Error('Neon спить'));
		const page = new URL('https://lilylook.store/product/palto');
		metaView(request(page.href), visitor, page);

		await flushMeta();

		const view = sent().body.data[1];
		expect(view.event_name).toBe('ViewContent');
		expect(view.custom_data.value).toBeUndefined();
		expect(view.custom_data.content_ids).toEqual(['palto']);
	});
});

describe('нормалізація особистого', () => {
	it.each([
		['Олена Коваль', 'олена', 'коваль'],
		['  Олена   Петрівна  Коваль ', 'олена', 'коваль'],
		["Мар'яна", 'маряна', ''],
		['ANNA-MARIA Smith', 'annamaria', 'smith']
	])('%s', (name, first, last) => {
		expect(splitName(name)).toEqual({ first, last });
	});

	it.each([
		['Київ', 'київ'],
		['м. Київ, Київська обл.', 'київ'],
		['смт Козин (Обухівський р-н)', 'козин'],
		['Івано-Франківськ', 'іванофранківськ']
	])('місто «%s»', (city, expected) => {
		expect(normalizeCity(city)).toBe(expected);
	});
});

describe('підтвердження домену', () => {
	it('код з оточення — метатег', () => {
		env.META_DOMAIN_VERIFICATION = 'abc123xyz7890def';

		expect(domainVerification()).toBe(
			'<meta name="facebook-domain-verification" content="abc123xyz7890def" />'
		);
	});

	it('порожньо або щось не схоже на код — нічого не вставляється', () => {
		expect(domainVerification()).toBe('');
		env.META_DOMAIN_VERIFICATION = '"><script>alert(1)</script>';
		expect(domainVerification()).toBe('');
	});
});
