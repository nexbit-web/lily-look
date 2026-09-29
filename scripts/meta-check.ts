import 'dotenv/config';

/**
 * Перевірка ключів Meta: `npm run meta:check [КОД_ТЕСТОВОЇ_ПОДІЇ]`
 *
 * 1. Чи задані META_PIXEL_ID і META_CAPI_TOKEN (сам токен не друкується).
 * 2. Чи пускає Meta з цим токеном до набору даних з цим ID.
 * 3. З кодом тестової події (Events Manager → набір даних → «Тестування
 *    подій») — шле одну пробну подію. Вона з'явиться на тій вкладці й не
 *    потрапить у справжню статистику реклами.
 */

const GRAPH = 'https://graph.facebook.com/v23.0';
const pixel = process.env.META_PIXEL_ID?.trim();
const token = process.env.META_CAPI_TOKEN?.trim();
const testCode = (process.argv[2] ?? process.env.META_TEST_EVENT_CODE ?? '').trim();

const ok = (text: string) => console.log(`  [ок]    ${text}`);
const bad = (text: string) => console.log(`  [збій]  ${text}`);
const hint = (text: string) => console.log(`          ${text}`);

type GraphError = { error?: { message?: string; code?: number } };

async function graph<T>(path: string, init?: RequestInit): Promise<T & GraphError> {
	try {
		const response = await fetch(`${GRAPH}/${path}`, {
			...init,
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			signal: AbortSignal.timeout(15_000)
		});
		return (await response.json()) as T & GraphError;
	} catch (cause) {
		return { error: { message: `запит не дійшов: ${String(cause)}` } } as T & GraphError;
	}
}

console.log('\nMeta Conversions API\n');

if (!pixel || !/^\d{10,20}$/.test(pixel)) {
	bad('META_PIXEL_ID не заданий або не схожий на ID (лише цифри).');
	process.exit(1);
}
ok(`META_PIXEL_ID = ${pixel}`);

if (!token) {
	bad('META_CAPI_TOKEN не заданий.');
	hint('Events Manager → набір даних → «Налаштування» → «Згенерувати маркер доступу».');
	process.exit(1);
}
if (!/^[A-Za-z0-9]{20,}$/.test(token)) {
	bad('META_CAPI_TOKEN — не токен Meta (схоже на заглушку). Сайт нічого не шле.');
	hint('Справжній токен — довгий рядок латиниці й цифр, зазвичай починається з EAA.');
	process.exit(1);
}
ok(`META_CAPI_TOKEN заданий (${token.length} символів)`);

// Токен з Events Manager уміє лише надсилати події, а читати набір даних
// йому не дано — «Missing Permission» тут норма, а не збій. Справжня
// перевірка — пробна подія нижче.
const dataset = await graph<{ name?: string; id?: string }>(`${pixel}?fields=name`);
const sendOnly = dataset.error?.code === 100 && /permission/i.test(dataset.error.message ?? '');
if (!dataset.error) {
	ok(`набір даних: «${dataset.name}»`);
} else if (sendOnly) {
	hint('Токен лише для надсилання подій (читати набір даних не може) — так і має бути.');
} else {
	bad(`Meta не відповіла про набір даних: ${dataset.error.message}`);
}

if (!testCode) {
	console.log('');
	hint('Перевірити, що Meta приймає події: npm run meta:check TEST12345');
	hint('(код — Events Manager → набір даних → «Тестування подій»)');
	console.log('');
	process.exit(dataset.error && !sendOnly ? 1 : 0);
}

const sent = await graph<{ events_received?: number; fbtrace_id?: string }>(`${pixel}/events`, {
	method: 'POST',
	body: JSON.stringify({
		test_event_code: testCode,
		data: [
			{
				event_name: 'PageView',
				event_time: Math.floor(Date.now() / 1000),
				event_id: `check-${Date.now()}`,
				action_source: 'website',
				event_source_url: 'https://lilylook.store/',
				user_data: {
					client_user_agent: 'LILY LOOK meta:check',
					client_ip_address: '93.170.0.1'
				}
			}
		]
	})
});

if (sent.error || !sent.events_received) {
	bad(`Meta не прийняла подію: ${sent.error?.message ?? 'невідома відповідь'}`);
	console.log('');
	process.exit(1);
}
ok(`Meta прийняла подію (${sent.events_received}). Відкрийте «Тестування подій» — там PageView.`);
console.log('');
