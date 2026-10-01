import { dev } from '$app/environment';
import { ANALYTICS_OPT_OUT } from '$lib/config';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db.js';

/**
 * Власна відвідуваність сайту: скільки людей зайшло, звідки, що дивились
 * і на якому кроці пішли. Звіти будує CRM з таблиці `PageEvent`.
 *
 * Головна вимога — сайт від цього не повільнішає ні на мілісекунду:
 *  — у браузер не вантажиться жодного скрипта: перший захід рахує сервер,
 *    поки й так віддає сторінку, а переходи всередині сайту — одне коротке
 *    повідомлення через `sendBeacon` уже після показу сторінки;
 *  — у базу запит не йде на кожен захід: подія лягає в пам'ять, і раз на
 *    30 с усе накопичене пишеться одним запитом у фоні. Ніхто на нього не
 *    чекає, а якщо база в цю мить недоступна — губиться лише статистика
 *    за ці 30 с, сайт працює далі.
 *
 * Хто є хто — за випадковою міткою в куці, без IP та імені. Боти й
 * пристрої команди (див. `ANALYTICS_OPT_OUT`) не рахуються зовсім.
 */

export const VISITOR_COOKIE = 'lily_vid';
/** Звідки людина прийшла востаннє — щоб замовлення через тиждень теж записалось на рекламу. */
export const SOURCE_COOKIE = 'lily_src';
/** Пристрій команди: відкрив секретне посилання — і більше не рахується. */
export const STAFF_COOKIE = 'lily_staff';

/** Chrome не тримає куку довше за 400 днів, хоч скільки попроси. */
const VISITOR_DAYS = 400;
/** Реклама вважається причиною візиту ще місяць після кліку. */
const SOURCE_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;

const FLUSH_MS = 30_000;
/**
 * Стеля на подій у пам'яті між записами. Навіть у пік це тисячі разів
 * більше за реальний потік, а от підроблені запити на `/api/view` не
 * виїдять пам'ять сервера.
 */
const MAX_BUFFER = 5_000;

/**
 * `wheel_shown` — вікно з колесом показали, `wheel_spin` — покрутив і виграв
 * приз (одна на людину: «Ще спроба» не рахується).
 */
export type EventType = 'view' | 'add_to_cart' | 'order' | 'wheel_shown' | 'wheel_spin';
export type PageKind =
	'home' | 'catalog' | 'collection' | 'product' | 'cart' | 'checkout' | 'order' | 'info' | 'other';
export type Source = 'facebook' | 'instagram' | 'google' | 'direct' | 'other';
export type Device = 'mobile' | 'desktop';

const SOURCES: readonly string[] = ['facebook', 'instagram', 'google', 'direct', 'other'];
const INFO_PAGES = new Set(['/delivery', '/returns', '/contacts']);

/**
 * Роботи, прев'ю посилань і перевірялки. Їх не цікавить товар, а в
 * статистиці вони перетворили б «людей за день» на випадкове число. Сюди ж
 * безголовий Chrome — ним ганяються тести швидкості й наші перевірки.
 */
const BOT =
	/bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|preview|headless|lighthouse|pagespeed|chrome-lighthouse|curl|wget|python|node-fetch|axios|okhttp|go-http|java\/|monitor|uptime|pingdom|whatsapp|telegram|viber|skype|slack|discord/i;

export function isBot(userAgent: string | null): boolean {
	return !userAgent || BOT.test(userAgent);
}

export function deviceOf(userAgent: string | null): Device {
	return /mobi|android|iphone|ipad|ipod/i.test(userAgent ?? '') ? 'mobile' : 'desktop';
}

export function pageOf(pathname: string): PageKind {
	if (pathname === '/') return 'home';
	if (pathname === '/catalog' || pathname.startsWith('/catalog/')) return 'catalog';
	if (pathname.startsWith('/collection/')) return 'collection';
	if (pathname.startsWith('/product/')) return 'product';
	if (pathname === '/cart') return 'cart';
	if (pathname === '/checkout') return 'checkout';
	if (pathname.startsWith('/order/')) return 'order';
	if (INFO_PAGES.has(pathname)) return 'info';
	return 'other';
}

/** Домен з адреси; кривий `Referer` — як його відсутність. */
function hostOf(address: string | null): string {
	if (!address) return '';
	try {
		return new URL(address).hostname;
	} catch {
		return '';
	}
}

function hostSource(host: string): Source {
	if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return 'facebook';
	if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
	if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
	return 'other';
}

/**
 * Звідки прийшов цей запит — або `null`, якщо запит нічого нового про це
 * не каже (перехід усередині сайту, адреса набрана руками). Тоді джерело
 * лишається те, що записане в куці з попереднього заходу.
 *
 * Реклама Facebook і Instagram дописує до посилання `fbclid`, Google —
 * `gclid`; мітки `utm_source` ставлять руками в рекламному кабінеті. Без
 * них лишається адреса сайту, з якого прийшли (`Referer`).
 */
export function sourceOf(url: URL, referer: string | null): Source | null {
	const refererHost = hostOf(referer);

	const utm = url.searchParams.get('utm_source')?.toLowerCase();
	if (utm) {
		if (/^(fb|facebook|meta)/.test(utm)) return 'facebook';
		if (/^(ig|instagram)/.test(utm)) return 'instagram';
		if (/^google/.test(utm)) return 'google';
		return 'other';
	}
	if (url.searchParams.has('fbclid')) {
		// Реклама в Instagram теж ставить fbclid — розрізняємо за тим, звідки клік.
		return hostSource(refererHost) === 'instagram' ? 'instagram' : 'facebook';
	}
	if (url.searchParams.has('gclid')) return 'google';
	if (!refererHost || refererHost === url.hostname) return null;
	return hostSource(refererHost);
}

export type Visitor = { id: string; source: Source; device: Device };

/**
 * Хто прийшов. `null` — цей запит не рахуємо: бот, пристрій команди,
 * режим розробки чи локальний запуск (вони пишуть у ту саму базу, що й
 * живий сайт, і змішали б свої перевірки з покупцями).
 *
 * Новому відвідувачу тут же ставиться кука з міткою, тож кличеться до
 * того, як відповідь пішла в браузер.
 */
export function identify(event: { url: URL; cookies: Cookies; request: Request }): Visitor | null {
	const { url, cookies, request } = event;
	if (dev || url.hostname === 'localhost' || url.hostname === '127.0.0.1') return null;
	if (cookies.get(STAFF_COOKIE)) return null;

	const userAgent = request.headers.get('user-agent');
	if (isBot(userAgent)) return null;

	const secure = url.protocol === 'https:';
	let id = cookies.get(VISITOR_COOKIE);
	if (!id || !/^[a-z0-9]{8,40}$/.test(id)) {
		id = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
		cookies.set(VISITOR_COOKIE, id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure,
			maxAge: VISITOR_DAYS * DAY_SECONDS
		});
	}

	const fresh = sourceOf(url, request.headers.get('referer'));
	if (fresh) {
		cookies.set(SOURCE_COOKIE, fresh, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure,
			maxAge: SOURCE_DAYS * DAY_SECONDS
		});
	}
	const remembered = cookies.get(SOURCE_COOKIE);
	const source =
		fresh ?? (remembered && SOURCES.includes(remembered) ? (remembered as Source) : 'direct');

	return { id, source, device: deviceOf(userAgent) };
}

/**
 * Секретне посилання для команди: `/?ne-rahuvaty=<ключ>`. Ставить куку, з
 * якою цей браузер більше ніколи не рахується. Повертає сторінку-відповідь
 * або `null`, якщо в запиті такого параметра немає.
 */
export function optOut(event: { url: URL; cookies: Cookies }): Response | null {
	const key = event.url.searchParams.get(ANALYTICS_OPT_OUT.param);
	if (key === null) return null;
	if (key !== ANALYTICS_OPT_OUT.key) return null;

	// Відповідь збираємо самі, без сторінки сайту, а кукі з `cookies.set`
	// SvelteKit додає лише до своїх відповідей — тож заголовок пишемо руками.
	const cookie = event.cookies.serialize(STAFF_COOKIE, '1', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: VISITOR_DAYS * DAY_SECONDS
	});
	return new Response(
		'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Статистика</title>' +
			'<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">' +
			'<h1 style="font-size:1.25rem">Цей пристрій більше не рахується в статистиці</h1>' +
			'<p>Ваші заходи на сайт з цього браузера не потраплятимуть у відвідуваність. Повторіть на кожному телефоні й комп’ютері, з якого перевіряєте сайт.</p>' +
			'<p><a href="/">На головну</a></p>',
		{
			headers: {
				'content-type': 'text/html; charset=utf-8',
				'cache-control': 'no-store',
				'set-cookie': cookie
			}
		}
	);
}

type Row = {
	visitorId: string;
	type: EventType;
	page: PageKind;
	path: string;
	source: Source;
	device: Device;
	createdAt: Date;
};

const buffer: Row[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

/** Записати подію. Миттєво: лише кладе рядок у пам'ять. */
export function track(visitor: Visitor, type: EventType, pathname: string): void {
	if (buffer.length >= MAX_BUFFER) return;
	const path = pathname.slice(0, 200);
	buffer.push({
		visitorId: visitor.id,
		type,
		page: pageOf(path),
		path,
		source: visitor.source,
		device: visitor.device,
		// Час події, а не запису: інакше все зсувалось би на 30 с.
		createdAt: new Date()
	});
	schedule();
}

function schedule() {
	if (timer) return;
	timer = setInterval(() => void flushEvents(), FLUSH_MS);
	// Таймер не тримає процес живим: інакше сервер не зупинявся б при деплої.
	timer.unref?.();
	// Перед зупинкою (деплой, перезапуск) дописуємо те, що накопичилось.
	// Подію `sveltekit:shutdown` шле adapter-node, коли сервер закриває з'єднання.
	process.once('sveltekit:shutdown', () => void flushEvents());
}

/**
 * Записати накопичене в базу. Помилка бази не виходить за межі статистики.
 *
 * Одним запитом із сімома масивами (`unnest`), а не `createMany`. Той
 * будує окремий параметр на кожне поле кожного рядка, і на пачці в
 * кілька тисяч подій (пік трафіку) займав сервер на півтори секунди —
 * усі сторінки в цю мить чекали. Тут параметрів завжди сім, хоч скільки
 * рядків, а розкладає їх сама база.
 *
 * Час іде текстом у UTC: колонка без часового поясу, і Postgres, читаючи
 * «…Z» у `timestamp`, просто відкидає позначку — лишається саме UTC.
 */
export async function flushEvents(): Promise<void> {
	if (buffer.length === 0) return;
	const batch = buffer.splice(0, buffer.length);
	try {
		await db.$executeRaw`
			INSERT INTO "PageEvent" ("visitorId", "type", "page", "path", "source", "device", "createdAt")
			SELECT visitor, type, page, path, source, device, created::timestamp(3)
			FROM unnest(
				${batch.map((row) => row.visitorId)}::text[],
				${batch.map((row) => row.type)}::text[],
				${batch.map((row) => row.page)}::text[],
				${batch.map((row) => row.path)}::text[],
				${batch.map((row) => row.source)}::text[],
				${batch.map((row) => row.device)}::text[],
				${batch.map((row) => row.createdAt.toISOString())}::text[]
			) AS event(visitor, type, page, path, source, device, created)`;
	} catch (error) {
		console.error(`[analytics] не вдалося записати ${batch.length} подій`, error);
	}
}

/** Лише для тестів. */
export function pendingEvents(): readonly Row[] {
	return buffer;
}
