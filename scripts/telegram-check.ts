import 'dotenv/config';
import { buildOrderMessage } from '../src/lib/order-message.js';
import type { CartLine } from '../src/lib/types.js';

/**
 * Проверка телеграм-бота: `npm run telegram:check`
 *
 * Отвечает на один вопрос — придёт ли менеджерам сообщение о заказе, и
 * если нет, то что именно пойти исправить. Проверяет по очереди токен,
 * чат и право писать, а в конце присылает в группу настоящее сообщение о
 * демо-заказе — ровно того вида, какой придёт с реального.
 *
 * Запускать можно сколько угодно: ничего, кроме одного сообщения в
 * группу, скрипт не делает. Заказ в базе не создаётся.
 */

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

const ok = (text: string) => console.log(`  [ок]    ${text}`);
const bad = (text: string) => console.log(`  [збій]  ${text}`);
const hint = (text: string) => console.log(`          ${text}`);

function done(success: boolean): never {
	console.log('');
	console.log(
		success
			? 'Бот налаштований. Повідомлення про замовлення дійдуть до менеджерів.'
			: 'Бот не працює. Виправте вказане вище й запустіть перевірку ще раз.'
	);
	process.exit(success ? 0 : 1);
}

type TelegramReply<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

async function call<T>(method: string, body?: unknown): Promise<TelegramReply<T>> {
	try {
		const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body ?? {}),
			signal: AbortSignal.timeout(10_000)
		});
		return (await response.json()) as TelegramReply<T>;
	} catch (cause) {
		return { ok: false, description: `запит не дійшов: ${String(cause)}` };
	}
}

console.log('');
console.log('Перевірка телеграм-бота LILY LOOK');
console.log('');

// ── 1. Змінні середовища ───────────────────────────────────────────────
if (!token || !chatId) {
	if (!token) bad('TELEGRAM_BOT_TOKEN не заданий');
	if (!chatId) bad('TELEGRAM_CHAT_ID не заданий');
	hint('Обидві змінні — у .env (локально) або в налаштуваннях хостингу.');
	hint('Токен: @BotFather → /mybots → API Token.');
	hint('ID групи: додайте в неї @RawDataBot і візьміть chat.id (він від’ємний).');
	done(false);
}
ok('обидві змінні на місці');

// ── 2. Токен ───────────────────────────────────────────────────────────
const me = await call<{ id: number; username: string; can_join_groups: boolean }>('getMe');
if (!me.ok || !me.result) {
	bad(`токен не приймається — ${me.description ?? 'без опису'}`);
	hint('Візьміть свіжий токен: @BotFather → /mybots → ваш бот → API Token.');
	done(false);
}
ok(`токен робочий, бот @${me.result.username}`);

// ── 3. Чат ─────────────────────────────────────────────────────────────
const chat = await call<{ id: number; type: string; title?: string }>('getChat', {
	chat_id: chatId
});
if (!chat.ok || !chat.result) {
	bad(`чат ${chatId} недоступний — ${chat.description ?? 'без опису'}`);
	if (/chat not found/i.test(chat.description ?? '')) {
		hint('Найчастіша причина: бота не додали в групу або ID вказаний невірно.');
		hint('ID групи від’ємний і зазвичай починається з -100.');
	}
	if (/kicked|Forbidden/i.test(chat.description ?? '')) {
		hint('Бота вигнали з групи — додайте його знову.');
	}
	done(false);
}
ok(`чат знайдено: ${chat.result.title ?? chat.result.id} (${chat.result.type})`);

// ── 4. Право писати ────────────────────────────────────────────────────
const member = await call<{ status: string }>('getChatMember', {
	chat_id: chatId,
	user_id: me.result.id
});
if (member.ok && member.result) {
	const status = member.result.status;
	if (status === 'left' || status === 'kicked') {
		bad(`бот у чаті зі статусом «${status}» — писати він не може`);
		hint('Додайте бота в групу заново.');
		done(false);
	}
	ok(`бот у чаті зі статусом «${status}»`);
}

// ── 5. Справжнє повідомлення ───────────────────────────────────────────
const line = (patch: Partial<CartLine>): CartLine => ({
	id: 'demo',
	variantId: 'demo',
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

const text = buildOrderMessage({
	number: 'LL-ПЕРЕВІРКА',
	customerName: 'Перевірка зв’язку',
	customerPhone: '+380000000000',
	customerEmail: null,
	method: 'NOVA_POSHTA_BRANCH',
	city: 'Одеса',
	address: 'Відділення № 12',
	comment: 'Це тестове повідомлення. Замовлення не створювалось.',
	lines: [
		line({}),
		line({
			id: 'demo-2',
			productName: 'Куртка-вітровка',
			color: 'Чорний',
			size: 'L',
			quantity: 2,
			lineTotal: 490_000
		})
	],
	subtotal: 754_900,
	deliveryCost: 0,
	total: 754_900,
	payment: 'Оплата при отриманні'
});

const sent = await call<{ message_id: number }>('sendMessage', {
	chat_id: chatId,
	text,
	parse_mode: 'HTML',
	link_preview_options: { is_disabled: true }
});

if (!sent.ok) {
	bad(`повідомлення не надіслалось — ${sent.description ?? 'без опису'}`);
	if (/can't parse entities/i.test(sent.description ?? '')) {
		hint('Зламалась розмітка повідомлення — це помилка в коді, не в налаштуваннях.');
	}
	done(false);
}
ok('тестове повідомлення надіслано — подивіться в групу');

console.log('');
console.log('Ось що бачить менеджер:');
console.log('');
console.log(
	text
		.replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1')
		.replace(/<[^>]+>/g, '')
		.split('\n')
		.map((row) => `  │ ${row}`)
		.join('\n')
);

done(true);
