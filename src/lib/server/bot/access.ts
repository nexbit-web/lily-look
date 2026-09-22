import type { BotRoleValue } from '$lib/bot-workflow';
import { db } from '../db.js';

/**
 * Хто має право говорити з ботом.
 *
 * Доступ видається одноразовим кодом: CRM створює рядок у `BotInvite`,
 * людина надсилає боту `/start <код>`, і аж тоді зʼявляється `BotUser` —
 * бо тільки в цю мить стає відомий її telegram id. Наперед його знати
 * не треба, і це головна зручність схеми: код можна переслати в будь-якому
 * месенджері, а після першого використання він мертвий.
 *
 * Сам telegram id підробити не можна: він приходить у вебхуці, який ми
 * приймаємо лише з правильним секретом (див. роут вебхука).
 */

export type Actor = {
	id: string;
	telegramId: bigint;
	chatId: bigint;
	name: string;
	role: BotRoleValue;
};

/** Хто це. `null` — доступу немає, і більше він нічого не дізнається. */
export async function findActor(telegramId: bigint): Promise<Actor | null> {
	const user = await db.botUser.findFirst({
		where: { telegramId, isActive: true },
		select: { id: true, telegramId: true, chatId: true, name: true, role: true }
	});

	return user as Actor | null;
}

export type Redeem =
	| { ok: true; actor: Actor; returning: boolean }
	| { ok: false; why: 'unknown' | 'used' | 'expired' | 'taken' };

/**
 * Погасити код і привʼязати людину.
 *
 * Гонка тут реальна: один код можуть надіслати двічі поспіль (Telegram
 * повторює апдейти) або двоє людей одночасно. Тому код гаситься
 * `updateMany` з умовою «ще не використаний» — виграє рівно один виклик,
 * решта побачить, що коду вже немає.
 */
export async function redeemInvite(
	code: string,
	profile: { telegramId: bigint; chatId: bigint; name: string; username: string | null }
): Promise<Redeem> {
	// Людина вже з доступом: код їй не потрібен, просто вітаємось.
	const existing = await findActor(profile.telegramId);
	if (existing) return { ok: true, actor: existing, returning: true };

	const invite = await db.botInvite.findUnique({
		where: { code },
		select: { id: true, role: true, usedAt: true, expiresAt: true }
	});

	if (!invite) return { ok: false, why: 'unknown' };
	if (invite.usedAt) return { ok: false, why: 'used' };
	if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
		return { ok: false, why: 'expired' };
	}

	// Той самий telegram id міг бути привʼязаний і вимкнений у CRM.
	// Повторно заводити його не можна — інакше вимкнений доступ
	// відновлювався б новим кодом в обхід рішення власника.
	const blocked = await db.botUser.findUnique({
		where: { telegramId: profile.telegramId },
		select: { id: true }
	});
	if (blocked) return { ok: false, why: 'taken' };

	const claimed = await db.botInvite.updateMany({
		where: { id: invite.id, usedAt: null },
		data: { usedAt: new Date() }
	});
	// Хтось устиг раніше — код уже не наш.
	if (claimed.count === 0) return { ok: false, why: 'used' };

	const user = await db.botUser.create({
		data: {
			telegramId: profile.telegramId,
			chatId: profile.chatId,
			name: profile.name,
			username: profile.username,
			role: invite.role
		},
		select: { id: true, telegramId: true, chatId: true, name: true, role: true }
	});

	await db.botInvite.update({ where: { id: invite.id }, data: { usedById: user.id } });

	return { ok: true, actor: user as Actor, returning: false };
}

/** Кому розсилати нові замовлення. */
export async function activeRecipients(): Promise<Actor[]> {
	const users = await db.botUser.findMany({
		where: { isActive: true },
		select: { id: true, telegramId: true, chatId: true, name: true, role: true },
		orderBy: { createdAt: 'asc' }
	});

	return users as Actor[];
}

/**
 * Чи оброблявся вже цей апдейт.
 *
 * Telegram перешле подію, якщо не дочекався 200, — а холодний старт
 * хостингу саме той випадок. Без цієї перевірки одне натискання могло б
 * перевести замовлення через два стани. Первинний ключ робить перевірку
 * атомарною: двічі вставити той самий `updateId` база не дасть.
 */
export async function alreadyHandled(updateId: bigint): Promise<boolean> {
	try {
		await db.botUpdate.create({ data: { updateId } });
		return false;
	} catch {
		return true;
	}
}
