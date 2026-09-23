import {
	commandsFor,
	decodeAction,
	isAdmin,
	statusLabel,
	type BotRoleValue
} from '$lib/bot-workflow';
import type { OrderStatusValue } from '$lib/bot-workflow';
import { formatPrice } from '$lib/money';
import { escapeHtml } from '$lib/order-message';
import {
	createInvite,
	findActor,
	leaveBot,
	listAccess,
	redeemInvite,
	setAccess,
	type Actor
} from './access.js';
import { answerCallback, clearChatCommands, sendMessage, setChatCommands } from './api.js';
import { activeOrders, applyStatus, orderCard, rememberNotice } from './orders.js';
import { buildReport } from './reports.js';

/**
 * Що бот робить у відповідь на повідомлення й натискання.
 *
 * Два правила, які тут ніде не порушуються.
 *
 * Перше: людина без доступу не дізнається нічого. Ні номерів, ні сум, ні
 * навіть того, чи існує таке замовлення, — однакова суха відповідь на
 * будь-який дотик. Інакше бот перетворюється на спосіб дізнатись, що в
 * магазині відбувається.
 *
 * Друге: команд, яких людині не видно, для неї не існує. Менеджер, що
 * набрав `/zvit`, бачить звичайну підказку, а не «вам це недоступно», —
 * бо друге вже повідомляє, що звіт десь є.
 */

const DENIED =
	'Доступу немає. Якщо він має бути — попросіть у власника магазину код і надішліть <code>/start ваш-код</code>.';

const HELP = [
	'<b>Що вміє бот</b>',
	'',
	'Нові замовлення приходять сюди самі. Статус міняється кнопками під повідомленням — окремих команд для цього не треба.',
	'',
	'<b>Команди</b>',
	'<code>/zamovlennia</code> — активні замовлення',
	'<code>/z LL-XXXXXX</code> — знайти замовлення за номером',
	'<code>/dopomoha</code> — ця підказка',
	'<code>/vyity</code> — вийти з бота',
	'',
	'Усі команди є в меню біля поля вводу — памʼятати їх не треба.'
].join('\n');

const ADMIN_HELP = [
	HELP,
	'',
	'<b>Власнику</b>',
	'<code>/zvit</code> — звіт: замовлення й виторг',
	'<code>/dostup</code> — хто має доступ',
	'<code>/kod РОЛЬ примітка</code> — видати код (ADMIN, MANAGER, COURIER)',
	'<code>/vymknuty ID</code> · <code>/uvimknuty ID</code> — закрити або відкрити доступ'
].join('\n');

const helpFor = (actor: Actor) => (isAdmin(actor.role) ? ADMIN_HELP : HELP);

/** Апдейт Telegram — рівно ті поля, які ми читаємо. */
export type Update = {
	update_id: number;
	message?: {
		chat: { id: number; type?: string };
		from?: { id: number; first_name?: string; last_name?: string; username?: string };
		text?: string;
	};
	callback_query?: {
		id: string;
		data?: string;
		from: { id: number; first_name?: string; last_name?: string; username?: string };
		message?: { chat: { id: number } };
	};
};

function displayName(from: { first_name?: string; last_name?: string; username?: string }): string {
	const full = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
	return full || from.username || 'Без імені';
}

async function handleStart(
	chatId: number,
	from: NonNullable<NonNullable<Update['message']>['from']>,
	code: string
): Promise<void> {
	if (!code) {
		const actor = await findActor(BigInt(from.id));
		await sendMessage(
			chatId,
			actor ? `Вітаю, ${escapeHtml(actor.name)}.\n\n${helpFor(actor)}` : DENIED
		);
		return;
	}

	const outcome = await redeemInvite(code, {
		telegramId: BigInt(from.id),
		chatId: BigInt(chatId),
		name: displayName(from),
		username: from.username ?? null
	});

	if (outcome.ok) {
		// Меню команд ставимо саме тут: воно залежить від ролі, а роль стає
		// відома тільки після того, як код погашено.
		await setChatCommands(chatId, commandsFor(outcome.actor.role));

		const greeting = outcome.returning
			? `Ви вже маєте доступ, ${escapeHtml(outcome.actor.name)}.`
			: `Готово, ${escapeHtml(outcome.actor.name)}. Доступ відкрито.`;
		await sendMessage(chatId, `${greeting}\n\n${helpFor(outcome.actor)}`);
		return;
	}

	// Формулювання навмисно однакові для «немає такого» й «вже використаний»:
	// перебором кодів не має бути видно, який із них існує.
	const why =
		outcome.why === 'throttled'
			? 'Забагато спроб. Спробуйте за десять хвилин.'
			: outcome.why === 'taken'
				? 'Для цього акаунта доступ закритий. Зверніться до власника магазину.'
				: 'Код не підходить. Перевірте його або попросіть новий.';
	await sendMessage(chatId, why);
}

async function handleList(actor: Actor): Promise<void> {
	const orders = await activeOrders();
	if (orders.length === 0) {
		await sendMessage(actor.chatId, 'Активних замовлень немає.');
		return;
	}

	const rows = orders.map((order) => {
		const when = new Intl.DateTimeFormat('uk-UA', {
			timeZone: 'Europe/Kyiv',
			day: 'numeric',
			month: 'short'
		}).format(order.createdAt);
		return [
			`<b>${escapeHtml(order.number)}</b> · ${escapeHtml(statusLabel(order.status as OrderStatusValue))}`,
			`   ${escapeHtml(order.customerName)} · ${formatPrice(order.total)} · ${escapeHtml(when)}`
		].join('\n');
	});

	await sendMessage(
		actor.chatId,
		['<b>Активні замовлення</b>', '', ...rows, '', 'Відкрити: <code>/z НОМЕР</code>'].join('\n')
	);
}

async function handleFind(actor: Actor, number: string, origin: string | null): Promise<void> {
	if (!number) {
		await sendMessage(actor.chatId, 'Вкажіть номер: <code>/z LL-XXXXXX</code>');
		return;
	}

	const wanted = number.toUpperCase();
	const card = await orderCard(wanted, actor.role, origin);
	if (!card) {
		await sendMessage(actor.chatId, `Замовлення ${escapeHtml(number)} не знайдено.`);
		return;
	}

	const outcome = await sendMessage(actor.chatId, card.text, card.keyboard);
	// Картку на вимогу теж тримаємо в списку: інакше вона лишиться з
	// кнопками від стану, який хтось уже змінив.
	if (outcome.ok) await rememberNotice(wanted, actor, outcome.result.message_id);
}

/**
 * Вийти з бота.
 *
 * Прибираємо меню команд разом із доступом: інакше в людини лишився б
 * список того, чого вона вже не може. Повернутись можна тільки новим
 * кодом — старий давно погашений.
 */
async function handleLeave(actor: Actor): Promise<void> {
	await leaveBot(actor);
	await clearChatCommands(actor.chatId);
	await sendMessage(
		actor.chatId,
		[
			`До зустрічі, ${escapeHtml(actor.name)}.`,
			'',
			'Замовлення більше не приходитимуть. Щоб повернутись, попросіть у власника новий код і надішліть <code>/start код</code>.'
		].join('\n')
	);
}

// ─── Команди власника ───────────────────────────────────────────────────

const ROLES: BotRoleValue[] = ['ADMIN', 'MANAGER', 'COURIER'];

async function handleAccessList(actor: Actor): Promise<void> {
	const rows = await listAccess();
	if (rows.length === 0) {
		await sendMessage(
			actor.chatId,
			'Доступ поки ні в кого. Видати: <code>/kod MANAGER імʼя</code>'
		);
		return;
	}

	const lines = rows.map((row) => {
		const who = row.username ? `${row.name} (@${row.username})` : row.name;
		const state = row.isActive ? row.role : `${row.role}, вимкнений`;
		return `${escapeHtml(who)}\n   ${escapeHtml(state)} · <code>${row.telegramId}</code>`;
	});

	await sendMessage(
		actor.chatId,
		[
			'<b>Доступ</b>',
			'',
			...lines,
			'',
			'Закрити: <code>/vymknuty ID</code> · відкрити: <code>/uvimknuty ID</code>'
		].join('\n')
	);
}

async function handleNewCode(actor: Actor, argument: string): Promise<void> {
	const [wanted, ...note] = argument.split(/\s+/).filter(Boolean);
	const role = (wanted ?? '').toUpperCase() as BotRoleValue;

	if (!ROLES.includes(role)) {
		await sendMessage(
			actor.chatId,
			`Вкажіть роль: <code>/kod MANAGER Олена зі складу</code>\nРолі: ${ROLES.join(', ')}`
		);
		return;
	}

	const code = await createInvite(role, note.join(' ') || null);
	await sendMessage(
		actor.chatId,
		[
			`<b>${escapeHtml(code)}</b>`,
			'',
			`Роль: ${role}. Діє тиждень, спрацює один раз.`,
			`Людина має надіслати боту: <code>/start ${escapeHtml(code)}</code>`
		].join('\n')
	);
}

async function handleAccessChange(
	actor: Actor,
	argument: string,
	isActive: boolean
): Promise<void> {
	const id = argument.trim();
	if (!/^\d+$/.test(id)) {
		await sendMessage(actor.chatId, 'Вкажіть ID із списку <code>/dostup</code>.');
		return;
	}

	// Себе вимкнути не можна: інакше власник замкне сам себе назовні,
	// і відкрити доступ буде нікому.
	if (!isActive && BigInt(id) === actor.telegramId) {
		await sendMessage(actor.chatId, 'Себе вимкнути не можна.');
		return;
	}

	const changed = await setAccess(BigInt(id), isActive);
	await sendMessage(
		actor.chatId,
		changed
			? `${escapeHtml(changed.name)} — доступ ${isActive ? 'відкрито' : 'закрито'}.`
			: 'Такого ID немає в списку.'
	);
}

async function handleMessage(message: NonNullable<Update['message']>, origin: string | null) {
	const from = message.from;
	const text = (message.text ?? '').trim();
	if (!from || !text) return;

	// Тільки особистий чат.
	//
	// Це не зручність, а захист: у групі `chat.id` — це група, і якби там
	// спрацював `/start`, доступ привʼязався б до неї. Тоді всі замовлення
	// магазину поїхали б у груповий чат, де сидить хто завгодно.
	if (message.chat.type && message.chat.type !== 'private') return;

	const [command, ...rest] = text.split(/\s+/);
	const argument = rest.join(' ').trim();
	const name = command.split('@')[0];

	// `/start` — єдина команда до авторизації: саме нею доступ і видається.
	if (name === '/start') {
		await handleStart(message.chat.id, from, argument);
		return;
	}

	const actor = await findActor(BigInt(from.id));
	if (!actor) {
		await sendMessage(message.chat.id, DENIED);
		return;
	}

	if (name === '/zamovlennia') return void (await handleList(actor));
	if (name === '/z') return void (await handleFind(actor, argument, origin));
	if (name === '/vyity') return void (await handleLeave(actor));
	if (name === '/dopomoha') return void (await sendMessage(actor.chatId, helpFor(actor)));

	if (isAdmin(actor.role)) {
		if (name === '/zvit') return void (await sendMessage(actor.chatId, await buildReport()));
		if (name === '/dostup') return void (await handleAccessList(actor));
		if (name === '/kod') return void (await handleNewCode(actor, argument));
		if (name === '/vymknuty') return void (await handleAccessChange(actor, argument, false));
		if (name === '/uvimknuty') return void (await handleAccessChange(actor, argument, true));
	}

	await sendMessage(actor.chatId, helpFor(actor));
}

async function handleCallback(
	query: NonNullable<Update['callback_query']>,
	origin: string | null
): Promise<void> {
	const actor = await findActor(BigInt(query.from.id));
	if (!actor) {
		await answerCallback(query.id, 'Доступу немає');
		return;
	}

	const action = query.data ? decodeAction(query.data) : null;
	if (!action) {
		await answerCallback(query.id, 'Невідома кнопка');
		return;
	}

	const outcome = await applyStatus(action.number, action.to, actor, origin);

	if (outcome.ok) {
		await answerCallback(query.id, statusLabel(outcome.status));
		return;
	}

	if (outcome.why === 'stale') {
		// Стан змінили повз цю картку — в CRM або з іншого чату. Саму картку
		// `applyStatus` уже перемалював, тож лишається сказати, що сталось.
		const now = outcome.status ? statusLabel(outcome.status).toLowerCase() : 'інший';
		await answerCallback(query.id, `Уже ${now} — картку оновлено`);
		return;
	}

	await answerCallback(
		query.id,
		outcome.why === 'missing' ? 'Замовлення не знайдено' : 'Вам це недоступно'
	);
}

/**
 * Розібрати апдейт. Нічого не кидає: вебхук має відповісти Telegram 200
 * навіть тоді, коли всередині щось пішло не так, — інакше він почне
 * присилати ту саму подію знову й знову.
 */
export async function handleUpdate(update: Update, origin: string | null): Promise<void> {
	try {
		if (update.callback_query) {
			await handleCallback(update.callback_query, origin);
			return;
		}
		if (update.message) await handleMessage(update.message, origin);
	} catch (cause) {
		console.error('[bot] апдейт не оброблено', cause);
	}
}
