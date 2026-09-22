import { decodeAction, statusLabel, type OrderStatusValue } from '$lib/bot-workflow';
import { formatPrice } from '$lib/money';
import { escapeHtml } from '$lib/order-message';
import { findActor, redeemInvite, type Actor } from './access.js';
import { answerCallback, sendMessage } from './api.js';
import { activeOrders, applyStatus, orderCard, rememberNotice } from './orders.js';

/**
 * Що бот робить у відповідь на повідомлення й натискання.
 *
 * Правило, яке тут ніде не порушується: людина без доступу не дізнається
 * нічого. Ні номерів, ні сум, ні навіть того, чи існує таке замовлення, —
 * однакова суха відповідь на будь-який дотик. Інакше бот перетворюється
 * на спосіб дізнатись, що в магазині відбувається.
 */

const DENIED =
	'Доступу немає. Якщо він має бути — попросіть у власника магазину код і надішліть <code>/start ваш-код</code>.';

const HELP = [
	'Команди:',
	'<code>/zamovlennia</code> — активні замовлення',
	'<code>/z LL-XXXXXX</code> — знайти замовлення за номером',
	'',
	'Нові замовлення приходять сюди самі. Статус міняється кнопками під повідомленням.'
].join('\n');

/** Апдейт Telegram — рівно ті поля, які ми читаємо. */
export type Update = {
	update_id: number;
	message?: {
		chat: { id: number };
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
		await sendMessage(chatId, actor ? `Вітаю, ${escapeHtml(actor.name)}.\n\n${HELP}` : DENIED);
		return;
	}

	const outcome = await redeemInvite(code, {
		telegramId: BigInt(from.id),
		chatId: BigInt(chatId),
		name: displayName(from),
		username: from.username ?? null
	});

	if (outcome.ok) {
		const greeting = outcome.returning
			? `Ви вже маєте доступ, ${escapeHtml(outcome.actor.name)}.`
			: `Готово, ${escapeHtml(outcome.actor.name)}. Доступ відкрито.`;
		await sendMessage(chatId, `${greeting}\n\n${HELP}`);
		return;
	}

	// Формулювання навмисно однакові для «немає такого» й «вже використаний»:
	// перебором кодів не має бути видно, який із них існує.
	const why =
		outcome.why === 'expired'
			? 'Код протермінований. Попросіть новий.'
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
		[`<b>Активні замовлення</b>`, '', ...rows, '', 'Відкрити: <code>/z НОМЕР</code>'].join('\n')
	);
}

async function handleFind(actor: Actor, number: string, origin: string | null): Promise<void> {
	if (!number) {
		await sendMessage(actor.chatId, 'Вкажіть номер: <code>/z LL-XXXXXX</code>');
		return;
	}

	const card = await orderCard(number.toUpperCase(), actor.role, origin);
	if (!card) {
		await sendMessage(actor.chatId, `Замовлення ${escapeHtml(number)} не знайдено.`);
		return;
	}

	const outcome = await sendMessage(actor.chatId, card.text, card.keyboard);
	// Картку на вимогу теж тримаємо в списку: інакше вона лишиться з
	// кнопками від стану, який хтось уже змінив.
	if (outcome.ok) await rememberNotice(number.toUpperCase(), actor, outcome.result.message_id);
}

async function handleMessage(message: NonNullable<Update['message']>, origin: string | null) {
	const from = message.from;
	const text = (message.text ?? '').trim();
	if (!from || !text) return;

	const [command, ...rest] = text.split(/\s+/);
	const argument = rest.join(' ').trim();

	// `/start` — єдина команда до авторизації: саме нею доступ і видається.
	if (command === '/start' || command.startsWith('/start@')) {
		await handleStart(message.chat.id, from, argument);
		return;
	}

	const actor = await findActor(BigInt(from.id));
	if (!actor) {
		await sendMessage(message.chat.id, DENIED);
		return;
	}

	const name = command.split('@')[0];
	if (name === '/zamovlennia') return void (await handleList(actor));
	if (name === '/z') return void (await handleFind(actor, argument, origin));
	if (name === '/dopomoha' || name === '/help') return void (await sendMessage(actor.chatId, HELP));

	await sendMessage(actor.chatId, HELP);
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
		const now = outcome.status ? statusLabel(outcome.status) : 'інший';
		await answerCallback(query.id, `Уже ${now.toLowerCase()} — хтось змінив раніше`);
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
