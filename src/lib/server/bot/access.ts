import type { BotRoleValue } from '$lib/bot/workflow';
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
		where: { telegramId, isActive: true, leftAt: null },
		select: { id: true, telegramId: true, chatId: true, name: true, role: true }
	});

	return user as Actor | null;
}

/**
 * Скільки разів підряд можна помилитись із кодом.
 *
 * Код — шість символів із 32-символьного алфавіту, тобто мільярд варіантів,
 * і підбирати його через Telegram довелось би роками. Лічильник тут не
 * замість цього, а на додачу: він робить перебір безглуздим одразу й
 * коштує рівно нічого — жодного запиту в базу на відкинутій спробі.
 *
 * Памʼять процесу, а не таблиця: перезапуск скидає лічильники, але
 * перезапускати сервер на кожні пʼять спроб — теж собі дорожче.
 */
const MAX_TRIES = 5;
const LOCK_MS = 10 * 60 * 1000;

const tries = new Map<string, { count: number; until: number }>();

function throttled(telegramId: bigint, now: number): boolean {
	const key = String(telegramId);
	const seen = tries.get(key);
	if (!seen) return false;

	if (seen.until > now) return seen.count >= MAX_TRIES;

	tries.delete(key);
	return false;
}

function countFailure(telegramId: bigint, now: number): void {
	const key = String(telegramId);
	const seen = tries.get(key);
	tries.set(key, {
		count: seen && seen.until > now ? seen.count + 1 : 1,
		until: now + LOCK_MS
	});

	// Мапа не має рости нескінченно: чистимо прострочене принагідно.
	if (tries.size > 500) {
		for (const [id, entry] of tries) if (entry.until <= now) tries.delete(id);
	}
}

export type Redeem =
	| { ok: true; actor: Actor; returning: boolean }
	| { ok: false; why: 'unknown' | 'used' | 'expired' | 'taken' | 'throttled' };

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

	// Перевірка перед запитом у базу: підбір не має навіть її торкатись.
	const now = Date.now();
	if (throttled(profile.telegramId, now)) return { ok: false, why: 'throttled' };

	const invite = await db.botInvite.findUnique({
		where: { code },
		select: { id: true, role: true, usedAt: true, expiresAt: true }
	});

	if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt.getTime() < now)) {
		countFailure(profile.telegramId, now);
		// Назви різні тільки в коді: назовні всі три випадки звучать
		// однаково, щоб перебором не було видно, який код існує.
		if (!invite) return { ok: false, why: 'unknown' };
		return { ok: false, why: invite.usedAt ? 'used' : 'expired' };
	}

	// Той самий telegram id міг бути привʼязаний раніше. Що з ним робити,
	// залежить від того, як він пішов: сам чи його прибрали.
	const previous = await db.botUser.findUnique({
		where: { telegramId: profile.telegramId },
		select: { id: true, leftAt: true }
	});

	// Прибрав власник — новим кодом не повернутись, інакше вимикач у CRM
	// не значив би нічого.
	if (previous && !previous.leftAt) return { ok: false, why: 'taken' };

	const claimed = await db.botInvite.updateMany({
		where: { id: invite.id, usedAt: null },
		data: { usedAt: new Date() }
	});
	// Хтось устиг раніше — код уже не наш.
	if (claimed.count === 0) return { ok: false, why: 'used' };

	const fields = {
		chatId: profile.chatId,
		name: profile.name,
		username: profile.username,
		role: invite.role,
		isActive: true,
		leftAt: null
	};

	// Пішов сам — оновлюємо старий рядок, а не заводимо новий: до нього
	// привʼязаний журнал подій, і втрачати «хто що робив» не можна.
	const user = previous
		? await db.botUser.update({
				where: { id: previous.id },
				data: fields,
				select: { id: true, telegramId: true, chatId: true, name: true, role: true }
			})
		: await db.botUser.create({
				data: { telegramId: profile.telegramId, ...fields },
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

// ─── Керування доступом: те, що може тільки власник ─────────────────────

/** Символи без 0/O/1/I — щоб код можна було продиктувати телефоном. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	const body = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
	return `LILY-${body}`;
}

/** Створити код. Термін дії за замовчуванням — тиждень. */
export async function createInvite(
	role: BotRoleValue,
	note: string | null,
	days = 7
): Promise<string> {
	const code = generateCode();

	await db.botInvite.create({
		data: {
			code,
			role,
			note,
			expiresAt: days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null
		}
	});

	return code;
}

export type AccessRow = {
	telegramId: bigint;
	name: string;
	username: string | null;
	role: BotRoleValue;
	isActive: boolean;
};

export async function listAccess(): Promise<AccessRow[]> {
	const rows = await db.botUser.findMany({
		select: { telegramId: true, name: true, username: true, role: true, isActive: true },
		orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }]
	});

	return rows as AccessRow[];
}

/**
 * Увімкнути або вимкнути доступ. Повертає, кого саме зачепили, —
 * щоб відповідь називала людину, а не просто «готово».
 */
export async function setAccess(
	telegramId: bigint,
	isActive: boolean
): Promise<{ name: string } | null> {
	const user = await db.botUser.findUnique({
		where: { telegramId },
		select: { id: true, name: true }
	});
	if (!user) return null;

	await db.botUser.update({ where: { id: user.id }, data: { isActive } });
	return { name: user.name };
}

/**
 * Прибрати старі записи про оброблені апдейти.
 *
 * Таблиця потрібна лише проти повторів, а Telegram повторює протягом
 * хвилин, не діб. Без чистки вона росла б вічно й тягла за собою індекс;
 * доба — запас на кілька порядків.
 */
export async function prunePastUpdates(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
	const { count } = await db.botUpdate.deleteMany({
		where: { createdAt: { lt: new Date(Date.now() - olderThanMs) } }
	});

	return count;
}

/**
 * Чи це останній власник із доступом.
 *
 * Питання не празне: коди видає тільки адмін і тільки зсередини бота,
 * а кожен код одноразовий. Якщо останній адмін вийде, видати новий
 * код буде нікому — бот лишиться живий, але без жодного входу, крім
 * ручного запису в базу.
 *
 * Окремий запит, а не поле в `Actor`: це потрібно рівно перед виходом,
 * і рахувати адмінів на кожне повідомлення заради однієї команди немає сенсу.
 */
export async function isLastAdmin(actor: Actor): Promise<boolean> {
	if (actor.role !== 'ADMIN') return false;

	const others = await db.botUser.count({
		where: { role: 'ADMIN', isActive: true, leftAt: null, id: { not: actor.id } }
	});

	return others === 0;
}

/**
 * Вийти з бота самому.
 *
 * Відрізняється від відкликання власником: `leftAt` каже, що людина пішла
 * добровільно, і повернутись новим кодом їй можна. Рядок лишається на
 * місці — до нього привʼязаний журнал, хто які замовлення вів.
 */
export async function leaveBot(actor: Actor): Promise<void> {
	await db.botUser.update({
		where: { id: actor.id },
		data: { isActive: false, leftAt: new Date() }
	});
}
