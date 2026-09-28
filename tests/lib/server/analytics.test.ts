import type { Cookies } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Відвідуваність. Головне тут — чесні цифри: людина одна й та сама в
 * різні дні, боти й команда не рахуються, реклама видна як реклама, а
 * сайт від підрахунку не чекає на базу ні мілісекунди.
 */

/** `db.$executeRaw` — тегований шаблон: (рядки SQL, ...значення). */
const executeRaw = vi.fn();

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$lib/server/db', () => ({ db: { $executeRaw: executeRaw } }));

/** Масиви, які пішли в базу останнім запитом: [мітки, типи, сторінки, адреси, джерела, пристрої, час]. */
const sentColumns = () => executeRaw.mock.calls.at(-1)!.slice(1) as string[][];

const {
	STAFF_COOKIE,
	VISITOR_COOKIE,
	deviceOf,
	flushEvents,
	identify,
	isBot,
	optOut,
	pageOf,
	pendingEvents,
	sourceOf,
	track
} = await import('$lib/server/analytics');
const { ANALYTICS_OPT_OUT } = await import('$lib/config');

const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]';
const DESKTOP =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** Кукі, як їх бачить сервер: те, що поставили, одразу можна прочитати. */
function jar(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	const set = vi.fn((name: string, value: string) => void store.set(name, value));
	const serialize = vi.fn(
		(name: string, value: string, options: { httpOnly?: boolean }) =>
			`${name}=${value}; Path=/${options.httpOnly ? '; HttpOnly' : ''}`
	);
	const cookies = { get: (name: string) => store.get(name), set, serialize } as unknown as Cookies;
	return { cookies, set, serialize, store };
}

function request(
	url: string,
	{
		ua = IPHONE,
		referer,
		cookies = jar().cookies
	}: { ua?: string | null; referer?: string; cookies?: Cookies } = {}
) {
	const headers = new Headers();
	if (ua) headers.set('user-agent', ua);
	if (referer) headers.set('referer', referer);
	return { url: new URL(url), cookies, request: new Request(url, { headers }) };
}

beforeEach(async () => {
	executeRaw.mockReset();
	await flushEvents();
	executeRaw.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('хто рахується', () => {
	it.each([
		['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
		['робот Facebook, що будує прев’ю', 'facebookexternalhit/1.1'],
		['Lighthouse і тести швидкості', 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0'],
		['прев’ю в Telegram', 'TelegramBot (like TwitterBot)'],
		['curl', 'curl/8.4.0'],
		['без User-Agent', null]
	])('%s — не людина', (_case, ua) => {
		expect(isBot(ua)).toBe(true);
	});

	it('браузер Facebook на iPhone і звичайний Chrome — люди', () => {
		expect(isBot(IPHONE)).toBe(false);
		expect(isBot(DESKTOP)).toBe(false);
	});

	it('телефон і комп’ютер розрізняються', () => {
		expect(deviceOf(IPHONE)).toBe('mobile');
		expect(deviceOf(DESKTOP)).toBe('desktop');
	});
});

describe('звідки прийшов', () => {
	const site = (query = '') => new URL(`https://lilylook.store/product/palto${query}`);

	it.each([
		['реклама Facebook (fbclid)', site('?fbclid=abc'), 'https://m.facebook.com/', 'facebook'],
		[
			'реклама в Instagram теж з fbclid',
			site('?fbclid=abc'),
			'https://l.instagram.com/',
			'instagram'
		],
		['мітка utm_source=fb', site('?utm_source=fb&utm_medium=paid'), undefined, 'facebook'],
		['мітка utm_source=ig', site('?utm_source=ig'), undefined, 'instagram'],
		['реклама Google (gclid)', site('?gclid=x'), undefined, 'google'],
		['пошук Google', site(), 'https://www.google.com.ua/', 'google'],
		['пост в Instagram', site(), 'https://www.instagram.com/', 'instagram'],
		['інший сайт', site(), 'https://prom.ua/', 'other']
	])('%s → %s', (_case, url, referer, expected) => {
		expect(sourceOf(url, referer ?? null)).toBe(expected);
	});

	it('перехід усередині сайту й набрана вручну адреса нічого не змінюють', () => {
		expect(sourceOf(site(), 'https://lilylook.store/catalog')).toBeNull();
		expect(sourceOf(site(), null)).toBeNull();
	});

	it('сторінки групуються так, щоб воронка читалась одразу', () => {
		expect(pageOf('/')).toBe('home');
		expect(pageOf('/catalog/sukni')).toBe('catalog');
		expect(pageOf('/collection/autumn')).toBe('collection');
		expect(pageOf('/product/palto')).toBe('product');
		expect(pageOf('/cart')).toBe('cart');
		expect(pageOf('/checkout')).toBe('checkout');
		expect(pageOf('/order/LL-ABC234')).toBe('order');
		expect(pageOf('/delivery')).toBe('info');
		expect(pageOf('/catalogue')).toBe('other');
	});
});

describe('мітка відвідувача', () => {
	it('новому ставиться кука на рік, httpOnly, лише для HTTPS', () => {
		const { cookies, set } = jar();

		const visitor = identify(request('https://lilylook.store/', { cookies }));

		expect(visitor?.id).toMatch(/^[a-z0-9]{20}$/);
		expect(set).toHaveBeenCalledWith(
			VISITOR_COOKIE,
			visitor?.id,
			expect.objectContaining({ httpOnly: true, secure: true, path: '/' })
		);
	});

	it('той самий браузер наступного дня — та сама людина', () => {
		const { cookies, set } = jar({ [VISITOR_COOKIE]: 'abc123def456ghi789jk' });

		const visitor = identify(request('https://lilylook.store/', { cookies }));

		expect(visitor?.id).toBe('abc123def456ghi789jk');
		expect(set).not.toHaveBeenCalledWith(VISITOR_COOKIE, expect.anything(), expect.anything());
	});

	it('прийшов з реклами, потім зайшов напряму — усе одно рахується на рекламу', () => {
		const { cookies } = jar();
		identify(request('https://lilylook.store/?fbclid=abc', { cookies }));

		const later = identify(request('https://lilylook.store/cart', { cookies }));

		expect(later?.source).toBe('facebook');
	});

	it('без реклами й без сайту-джерела — прямий захід', () => {
		expect(identify(request('https://lilylook.store/'))?.source).toBe('direct');
	});

	it('бот, пристрій команди й локальний запуск — не рахуються', () => {
		expect(identify(request('https://lilylook.store/', { ua: 'Googlebot/2.1' }))).toBeNull();
		expect(
			identify(
				request('https://lilylook.store/', { cookies: jar({ [STAFF_COOKIE]: '1' }).cookies })
			)
		).toBeNull();
		expect(identify(request('http://localhost:4173/'))).toBeNull();
	});
});

describe('секретне посилання команди', () => {
	it('з правильним ключем — кука «не рахувати» й сторінка-підтвердження', async () => {
		const { cookies, serialize } = jar();
		const url = new URL(
			`https://lilylook.store/?${ANALYTICS_OPT_OUT.param}=${ANALYTICS_OPT_OUT.key}`
		);

		const response = optOut({ url, cookies });

		// Кука — саме в заголовку відповіді: цю сторінку хук віддає сам, і
		// `cookies.set` SvelteKit до неї не додав би (так і було в першій версії).
		expect(serialize).toHaveBeenCalledWith(
			STAFF_COOKIE,
			'1',
			expect.objectContaining({ httpOnly: true, secure: true })
		);
		expect(response?.headers.get('set-cookie')).toContain(`${STAFF_COOKIE}=1`);
		expect(await response?.text()).toContain('більше не рахується');
	});

	it('з чужим ключем або без нього — звичайна сторінка', () => {
		const { cookies, set, serialize } = jar();

		expect(
			optOut({ url: new URL(`https://lilylook.store/?${ANALYTICS_OPT_OUT.param}=x`), cookies })
		).toBeNull();
		expect(optOut({ url: new URL('https://lilylook.store/'), cookies })).toBeNull();
		expect(set).not.toHaveBeenCalled();
		expect(serialize).not.toHaveBeenCalled();
	});
});

describe('запис у базу', () => {
	const visitor = { id: 'abc123def456ghi789jk', source: 'facebook', device: 'mobile' } as const;

	it('подія лише лягає в пам’ять — у базу ніхто не чекає', () => {
		track(visitor, 'view', '/product/palto');

		expect(executeRaw).not.toHaveBeenCalled();
		expect(pendingEvents()).toHaveLength(1);
		expect(pendingEvents()[0]).toMatchObject({ type: 'view', page: 'product', source: 'facebook' });
	});

	it('раз на 30 секунд усе накопичене пишеться одним запитом із сімома масивами', async () => {
		vi.useFakeTimers();
		// Модуль заводить таймер при першій події — у цьому тесті він уже міг бути,
		// тож пишемо явно тим самим шляхом, що й таймер.
		track(visitor, 'view', '/');
		track(visitor, 'add_to_cart', '/product/palto');
		track(visitor, 'order', '/checkout');

		await flushEvents();

		expect(executeRaw).toHaveBeenCalledTimes(1);
		// Сім масивів — хоч скільки подій: запит не росте разом із пачкою.
		expect(sentColumns()).toHaveLength(7);
		expect(sentColumns()[1]).toEqual(['view', 'add_to_cart', 'order']);
		expect(pendingEvents()).toHaveLength(0);
	});

	it('база недоступна — сайт працює далі, губиться лише ця пачка статистики', async () => {
		executeRaw.mockRejectedValue(new Error('Neon спить'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		track(visitor, 'view', '/');

		await expect(flushEvents()).resolves.toBeUndefined();
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it('час події — момент заходу, а не момент запису', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
		track(visitor, 'view', '/');
		vi.setSystemTime(new Date('2026-09-28T10:00:25Z'));

		await flushEvents();

		// Текстом у UTC: колонка без часового поясу зберігає саме це значення.
		expect(sentColumns()[6]).toEqual(['2026-09-28T10:00:00.000Z']);
	});
});
