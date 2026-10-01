import { env } from '$env/dynamic/private';
import { priceValue } from '$lib/money';
import type { CheckoutInput } from '$lib/schemas';
import type { Cookies } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import type { Visitor } from './analytics.js';
import { clientIp } from './client-ip.js';
import { db } from './db.js';

/**
 * Події для реклами Meta (Facebook, Instagram) — через Conversions API,
 * прямо з сервера.
 *
 * Навіщо: без них Facebook не знає, хто з тих, кого він привів, купив, і
 * шукає тих, хто найохочіше клікає. З ними — вчиться на покупцях і шукає
 * схожих, а в кабінеті видно, яке оголошення приносить замовлення.
 *
 * Чому з сервера, а не пікселем у браузері: у браузер не вантажиться
 * жодного скрипта, тож сайт не повільнішає, а блокувальники реклами
 * нічого не вирізають. Правило те саме, що й у відвідуваності: подія
 * лише лягає в пам'ять, і раз на 10 с накопичене йде в Meta одним
 * запитом у фоні. Ніхто на нього не чекає; не відповіла Meta — губиться
 * ця пачка подій, а не покупка.
 *
 * Шлемо лише за тими, кого рахує відвідуваність (`identify`): боти,
 * пристрої команди й локальний запуск у рекламу не потрапляють.
 *
 * Поки в оточенні немає META_PIXEL_ID і META_CAPI_TOKEN — нічого не
 * відбувається зовсім.
 */

const GRAPH = 'https://graph.facebook.com/v23.0';
/** Meta оцінює подію тим краще, чим швидше вона дійшла, — тож частіше, ніж статистика. */
const FLUSH_MS = 10_000;
/** Більше за раз Meta не приймає; до цього й близько не дійде. */
const MAX_BUFFER = 1_000;

/** Клік по рекламі (`fbclid`) — щоб і покупка через тиждень записалась на оголошення. */
export const CLICK_COOKIE = 'lily_fbc';
/** Стільки Meta пов'язує покупку з кліком. */
const CLICK_DAYS = 90;

export type MetaEventName =
	'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';

/**
 * Ключі з оточення — або `null`, поки їх немає чи там заглушка з
 * `.env.example`. ID — лише цифри, токен Meta — довгий рядок латиниці
 * й цифр; усе інше Meta однаково відхилила б на кожній пачці.
 */
function keys(): { pixel: string; token: string } | null {
	const pixel = env.META_PIXEL_ID?.trim() ?? '';
	const token = env.META_CAPI_TOKEN?.trim() ?? '';
	if (!/^\d{10,20}$/.test(pixel) || !/^[A-Za-z0-9]{20,}$/.test(token)) return null;
	return { pixel, token };
}

export function isMetaConfigured(): boolean {
	return keys() !== null;
}

type RequestLike = {
	url: URL;
	cookies: Cookies;
	request: Request;
	getClientAddress?: () => string;
};

/**
 * Запам'ятати клік по рекламі. Кличеться до відповіді (кука), лише на
 * повному завантаженні сторінки: саме так відкривається посилання з
 * оголошення.
 *
 * Формат значення задає Meta: `fb.1.<час першого заходу>.<fbclid>`. Той
 * самий клік удруге (оновили сторінку) час не зсуває.
 */
export function rememberAdClick(event: RequestLike): void {
	if (!isMetaConfigured()) return;
	const fbclid = event.url.searchParams.get('fbclid');
	if (!fbclid || !/^[\w-]{1,500}$/.test(fbclid)) return;
	if (event.cookies.get(CLICK_COOKIE)?.endsWith(`.${fbclid}`)) return;

	event.cookies.set(CLICK_COOKIE, `fb.1.${Date.now()}.${fbclid}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: CLICK_DAYS * 24 * 60 * 60
	});
}

/** Хто це — те, за чим Meta впізнає людину, що бачила оголошення. */
type Person = {
	visitorId: string;
	ip: string | null;
	userAgent: string | null;
	fbc: string | null;
};

function personOf(event: RequestLike, visitor: Visitor): Person {
	const fbc = event.cookies.get(CLICK_COOKIE);
	return {
		visitorId: visitor.id,
		ip: clientIp(event),
		userAgent: event.request.headers.get('user-agent'),
		fbc: fbc && /^fb\.1\.\d+\.[\w-]+$/.test(fbc) ? fbc : null
	};
}

/** Позиція події. Ціни немає — підтягнеться з бази під час відправки. */
type Item = { slug: string; name?: string; unitPrice?: number; quantity: number };

type Customer = Pick<
	CheckoutInput,
	'customerName' | 'customerPhone' | 'customerEmail' | 'deliveryCity'
>;

type Pending = {
	name: MetaEventName;
	id: string;
	/** Секунди, як хоче Meta. */
	time: number;
	url: string;
	person: Person;
	items: Item[];
	orderNumber?: string;
	customer?: Customer;
};

const buffer: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let shutdownHooked = false;

/**
 * Скільки подій Meta прийняла з останнього звіту в журналі. Без цього
 * по журналу не зрозуміти, чи працює відправка: помилки видно, а успіх —
 * ні. Звіт — при першій прийнятій пачці після запуску й далі раз на годину.
 */
const REPORT_MS = 60 * 60 * 1000;
let accepted = 0;
let reportedAt: number | null = null;

/** `{"events_received": 3, …}` → 3; щось інше — `null`. */
function receivedCount(reply: string): number | null {
	try {
		const count = (JSON.parse(reply) as { events_received?: unknown }).events_received;
		return typeof count === 'number' ? count : null;
	} catch {
		return null;
	}
}

function reportAccepted(count: number) {
	accepted += count;
	const now = Date.now();
	if (reportedAt !== null && now - reportedAt < REPORT_MS) return;
	console.log(
		reportedAt === null
			? `[meta] працює: Meta прийняла першу пачку, ${accepted} подій`
			: `[meta] за годину Meta прийняла ${accepted} подій`
	);
	accepted = 0;
	reportedAt = now;
}

function push(event: RequestLike, visitor: Visitor, pending: Omit<Pending, 'time' | 'person'>) {
	if (!isMetaConfigured() || buffer.length >= MAX_BUFFER) return;
	buffer.push({
		...pending,
		time: Math.floor(Date.now() / 1000),
		person: personOf(event, visitor)
	});
	schedule();
}

function schedule() {
	if (!shutdownHooked) {
		shutdownHooked = true;
		// Перед зупинкою (деплой, перезапуск) відправляємо те, що накопичилось.
		process.once('sveltekit:shutdown', () => void flushMeta());
	}
	if (timer) return;
	timer = setTimeout(() => {
		timer = undefined;
		void flushMeta();
	}, FLUSH_MS);
	// Таймер не тримає процес живим: інакше сервер не зупинявся б при деплої.
	timer.unref?.();
}

/** Адреса сторінки без параметрів: `fbclid` і мітки Meta знає й так. */
function pageAddress(url: URL): string {
	return `${url.origin}${url.pathname}`;
}

/**
 * Показ сторінки. Кожна — PageView (з них будуються аудиторії «були на
 * сайті»), картка товару — ще й ViewContent, оформлення — InitiateCheckout.
 */
export function metaView(event: RequestLike, visitor: Visitor, page: URL): void {
	const url = pageAddress(page);
	push(event, visitor, { name: 'PageView', id: crypto.randomUUID(), url, items: [] });

	const slug = /^\/product\/([^/]+)$/.exec(page.pathname)?.[1];
	if (slug) {
		push(event, visitor, {
			name: 'ViewContent',
			id: crypto.randomUUID(),
			url,
			items: [{ slug: decodeURIComponent(slug), quantity: 1 }]
		});
	} else if (page.pathname === '/checkout') {
		push(event, visitor, { name: 'InitiateCheckout', id: crypto.randomUUID(), url, items: [] });
	}
}

export function metaAddToCart(event: RequestLike, visitor: Visitor, item: Required<Item>): void {
	push(event, visitor, {
		name: 'AddToCart',
		id: crypto.randomUUID(),
		url: pageAddress(event.url),
		items: [item]
	});
}

/**
 * Замовлення. Ідентифікатор події — номер замовлення: якщо колись на сайті
 * з'явиться ще й піксель, Meta зведе дві однакові покупки в одну.
 */
export function metaPurchase(
	event: RequestLike,
	visitor: Visitor,
	order: { number: string; items: Required<Item>[] },
	customer: Customer
): void {
	push(event, visitor, {
		name: 'Purchase',
		id: order.number,
		url: pageAddress(event.url),
		items: order.items,
		orderNumber: order.number,
		customer
	});
}

// ─── Відправка ──────────────────────────────────────────────────────────────

/**
 * Особисте Meta приймає лише гешем SHA-256 і лише в нормалізованому вигляді:
 * малими літерами, без пробілів і розділових знаків. Так і ім'я з
 * замовлення, і ім'я в профілі Facebook дають той самий геш.
 */
function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function hashed(value: string | null | undefined): string[] | undefined {
	return value ? [sha256(value)] : undefined;
}

function letters(value: string): string {
	return value.toLowerCase().replace(/[^\p{L}]/gu, '');
}

/** «Олена Коваль» → ім'я «олена», прізвище «коваль». Одне слово — лише ім'я. */
export function splitName(fullName: string): { first: string; last: string } {
	const words = fullName.trim().split(/\s+/).map(letters).filter(Boolean);
	return { first: words[0] ?? '', last: words.length > 1 ? (words.at(-1) ?? '') : '' };
}

/** «м. Київ, Київська обл.» → «київ». */
export function normalizeCity(city: string): string {
	const name = city
		.split(/[,(]/)[0]
		.trim()
		.replace(/^(м|с|смт|сел|селище|місто)\.?\s+/iu, '');
	return letters(name);
}

function userData(person: Person, customer: Customer | undefined) {
	const name = customer ? splitName(customer.customerName) : null;
	return {
		client_ip_address: person.ip ?? undefined,
		client_user_agent: person.userAgent ?? undefined,
		fbc: person.fbc ?? undefined,
		external_id: hashed(person.visitorId),
		// «+380671234567» → «380671234567»: код країни є, плюса немає.
		ph: hashed(customer?.customerPhone.replace(/\D/g, '')),
		em: hashed(customer?.customerEmail?.trim().toLowerCase()),
		fn: hashed(name?.first),
		ln: hashed(name?.last),
		ct: hashed(customer?.deliveryCity ? normalizeCity(customer.deliveryCity) : ''),
		country: customer ? hashed('ua') : undefined
	};
}

/**
 * Товари — моделями (`product_group`, id — адреса товару): так само вони
 * згруповані у фіді (`item_group_id`), і якщо каталог Meta колись
 * підтягне фід, динамічна реклама впізнає ті самі моделі.
 */
function customData(event: Pending) {
	if (event.items.length === 0) return undefined;
	const priced = event.items.filter((item) => item.unitPrice !== undefined);
	const total = priced.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);
	return {
		currency: 'UAH',
		value: priced.length ? priceValue(total) : undefined,
		content_type: 'product_group',
		content_ids: event.items.map((item) => item.slug),
		content_name: event.items.length === 1 ? event.items[0].name : undefined,
		contents: event.items.map((item) => ({
			id: item.slug,
			quantity: item.quantity,
			item_price: item.unitPrice === undefined ? undefined : priceValue(item.unitPrice)
		})),
		num_items: event.items.reduce((sum, item) => sum + item.quantity, 0),
		order_id: event.orderNumber
	};
}

export function toPayload(event: Pending) {
	return {
		event_name: event.name,
		event_time: event.time,
		event_id: event.id,
		event_source_url: event.url,
		action_source: 'website',
		user_data: userData(event.person, event.customer),
		custom_data: customData(event)
	};
}

/**
 * Перегляд товару рахується до того, як ми знаємо ціну (адреса — усе, що є
 * в `/api/view`). Ціни й назви всієї пачки — одним запитом тут, у фоні, а
 * не в запиті покупця.
 */
async function priceItems(batch: Pending[]): Promise<void> {
	const unknown = batch
		.flatMap((event) => event.items)
		.filter((item) => item.unitPrice === undefined);
	if (unknown.length === 0) return;

	const rows = await db.product.findMany({
		where: { slug: { in: [...new Set(unknown.map((item) => item.slug))] } },
		select: { slug: true, name: true, finalPrice: true }
	});
	const bySlug = new Map(rows.map((row) => [row.slug, row]));
	for (const item of unknown) {
		const row = bySlug.get(item.slug);
		if (!row) continue;
		item.unitPrice = row.finalPrice;
		item.name = row.name;
	}
}

/** Відправити накопичене. Помилка Meta чи мережі не виходить за межі реклами. */
export async function flushMeta(): Promise<void> {
	if (buffer.length === 0) return;
	const batch = buffer.splice(0, buffer.length);
	const credentials = keys();
	if (!credentials) return;
	const { pixel, token } = credentials;

	try {
		await priceItems(batch);
	} catch (error) {
		// Без цін подія все одно корисна: Meta бачить, що товар дивились.
		console.error('[meta] не вдалося підтягнути ціни', error);
	}

	const testCode = env.META_TEST_EVENT_CODE?.trim();
	try {
		const response = await fetch(`${GRAPH}/${encodeURIComponent(pixel)}/events`, {
			method: 'POST',
			// Токен — у заголовку, як у `npm run meta:check`: цей шлях Meta
			// підтвердила пробною подією. І не в адресі — адреси йдуть у журнали.
			headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
			body: JSON.stringify({
				data: batch.map(toPayload),
				test_event_code: testCode || undefined
			}),
			signal: AbortSignal.timeout(15_000)
		});
		const reply = await response.text();
		if (!response.ok) {
			console.error(
				`[meta] Meta не прийняла ${batch.length} подій: ${response.status} ${reply.slice(0, 500)}`
			);
			return;
		}
		reportAccepted(receivedCount(reply) ?? batch.length);
	} catch (error) {
		console.error(`[meta] не вдалося відправити ${batch.length} подій`, error);
	}
}

/**
 * Підтвердження домену в Meta Business — метатег, якщо заданий. Значення
 * з оточення, тож пропускаємо лише те, що схоже на код Meta: ніякий
 * символ не вийде за межі атрибута.
 */
export function domainVerification(): string {
	const code = env.META_DOMAIN_VERIFICATION?.trim();
	if (!code || !/^[a-z0-9]{10,64}$/i.test(code)) return '';
	return `<meta name="facebook-domain-verification" content="${code}" />`;
}

/** Лише для тестів. */
export function pendingMeta(): readonly Pending[] {
	return buffer;
}
