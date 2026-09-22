import 'dotenv/config';

/**
 * Регистрация вебхука: `npm run telegram:webhook [URL]`
 *
 * Telegram должен знать, куда присылать сообщения и нажатия. Это делается
 * один раз и повторяется только при смене домена или секрета.
 *
 * Без аргумента адрес берётся из PUBLIC_SITE_URL. Локальный адрес не
 * подойдёт — Telegram ходит только по публичному HTTPS.
 *
 * `npm run telegram:webhook -- --status` — показать текущее состояние,
 * ничего не меняя. `-- --delete` — отключить вебхук.
 */

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

const ok = (text: string) => console.log(`  [ок]    ${text}`);
const bad = (text: string) => console.log(`  [збій]  ${text}`);
const hint = (text: string) => console.log(`          ${text}`);

function done(success: boolean): never {
	console.log('');
	process.exit(success ? 0 : 1);
}

type Reply<T> = { ok: boolean; result?: T; description?: string };

async function call<T>(method: string, body?: unknown): Promise<Reply<T>> {
	try {
		const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body ?? {}),
			signal: AbortSignal.timeout(10_000)
		});
		return (await response.json()) as Reply<T>;
	} catch (cause) {
		return { ok: false, description: `запит не дійшов: ${String(cause)}` };
	}
}

type WebhookInfo = {
	url: string;
	pending_update_count: number;
	last_error_date?: number;
	last_error_message?: string;
};

async function status(): Promise<void> {
	const info = await call<WebhookInfo>('getWebhookInfo');
	if (!info.ok || !info.result) {
		bad(`не вдалося дізнатись стан — ${info.description ?? 'без опису'}`);
		done(false);
	}

	const current = info.result;
	if (!current.url) {
		bad('вебхук не зареєстрований — бот не отримує ні команд, ні натискань');
		hint('Запустіть: npm run telegram:webhook');
	} else {
		ok(`вебхук: ${current.url}`);
		ok(`подій у черзі: ${current.pending_update_count}`);
	}

	if (current.last_error_message) {
		const when = current.last_error_date
			? new Date(current.last_error_date * 1000).toLocaleString('uk-UA')
			: 'колись';
		bad(`остання помилка доставки (${when}): ${current.last_error_message}`);
		hint('Найчастіше це сплячий хостинг або неправильний секрет.');
	}
}

console.log('');
console.log('Вебхук телеграм-бота LILY LOOK');
console.log('');

if (!token) {
	bad('TELEGRAM_BOT_TOKEN не заданий');
	hint('Токен: @BotFather → /mybots → API Token.');
	done(false);
}

const flags = process.argv.slice(2);

if (flags.includes('--status')) {
	await status();
	done(true);
}

if (flags.includes('--delete')) {
	const dropped = await call('deleteWebhook', { drop_pending_updates: false });
	if (!dropped.ok) {
		bad(`не вимкнувся — ${dropped.description ?? 'без опису'}`);
		done(false);
	}
	ok('вебхук вимкнено, бот більше нічого не отримує');
	done(true);
}

if (!secret) {
	bad('TELEGRAM_WEBHOOK_SECRET не заданий');
	hint('Це спільний секрет між вами й Telegram: без нього адресу вебхука');
	hint('може смикнути будь-хто, хто її вгадав.');
	hint('Згенерувати: node -e "console.log(crypto.randomUUID())"');
	done(false);
}

const base = (flags.find((flag) => !flag.startsWith('--')) ?? process.env.PUBLIC_SITE_URL ?? '')
	.trim()
	.replace(/\/+$/, '');

if (!base) {
	bad('не вказано адресу сайту');
	hint('Передайте її аргументом або задайте PUBLIC_SITE_URL.');
	done(false);
}

if (!base.startsWith('https://')) {
	bad(`Telegram ходить тільки по HTTPS, а тут ${base}`);
	hint('Локальний сервер вебхуком не перевірити — потрібен публічний домен.');
	done(false);
}

const url = `${base}/api/telegram/webhook`;

const set = await call('setWebhook', {
	url,
	secret_token: secret,
	// Зайвого не просимо: бот читає лише повідомлення й натискання кнопок.
	allowed_updates: ['message', 'callback_query'],
	max_connections: 10
});

if (!set.ok) {
	bad(`не зареєструвався — ${set.description ?? 'без опису'}`);
	done(false);
}

ok(`вебхук зареєстровано: ${url}`);
console.log('');
await status();

console.log('');
console.log('Далі: той самий TELEGRAM_WEBHOOK_SECRET має бути в змінних хостингу.');
done(true);
