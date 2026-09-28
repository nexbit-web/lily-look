import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Хук бачить кожен запит: без бази — на інструкцію, заголовки безпеки —
 * на кожну відповідь, розмітка Schema.org — рівно один тег на сторінку,
 * відвідуваність — лише справжні сторінки.
 */

let configured = true;
const visitor = { id: 'abc123def456ghi789jk', source: 'direct', device: 'mobile' };
const identify = vi.fn();
const track = vi.fn();
const optOut = vi.fn();

vi.mock('$lib/server/db', () => ({ isDatabaseConfigured: () => configured }));
vi.mock('$lib/server/analytics', () => ({ identify, track, optOut }));

const { handle } = await import('$src/hooks.server');

const PAGE = '<html><head>%lily.jsonld%</head><body></body></html>';

type Options = {
	jsonLd?: Record<string, unknown>[];
	/** Перехід усередині сайту (`__data.json`), а не завантаження сторінки. */
	data?: boolean;
	accept?: string;
	routeId?: string | null;
	status?: number;
	contentType?: string;
};

async function request(path: string, options: Options = {}) {
	const url = new URL(path);
	const event = {
		url,
		locals: { jsonLd: options.jsonLd },
		request: new Request(url, { headers: { accept: options.accept ?? 'text/html,*/*' } }),
		route: { id: options.routeId === undefined ? url.pathname : options.routeId },
		isDataRequest: options.data ?? false,
		cookies: {}
	} as unknown as RequestEvent;
	let html = '';
	const response = await handle({
		event,
		resolve: async (_event, resolveOptions) => {
			html = (await resolveOptions?.transformPageChunk?.({ html: PAGE, done: true })) ?? PAGE;
			return new Response(html, {
				status: options.status ?? 200,
				headers: { 'content-type': options.contentType ?? 'text/html' }
			});
		}
	});
	return { response, html };
}

beforeEach(() => {
	configured = true;
	vi.clearAllMocks();
	identify.mockReturnValue(visitor);
	optOut.mockReturnValue(null);
});

describe('без бази', () => {
	it('будь-яка сторінка веде на /setup', async () => {
		configured = false;

		await expect(request('https://lilylook.store/catalog')).rejects.toMatchObject({
			status: 307,
			location: '/setup'
		});
	});

	it('з базою /setup більше не потрібна — на головну', async () => {
		await expect(request('https://lilylook.store/setup')).rejects.toMatchObject({
			location: '/'
		});
	});
});

describe('заголовки безпеки', () => {
	it('на кожній відповіді: без чужих iframe, без вгадування типу, без камери', async () => {
		const { response } = await request('https://lilylook.store/');

		expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
		expect(response.headers.get('permissions-policy')).toContain('camera=()');
	});

	it('HSTS — лише на HTTPS, інакше локальний сервер заблокував би сам себе', async () => {
		const secure = await request('https://lilylook.store/');
		const local = await request('http://localhost:5173/');

		expect(secure.response.headers.get('strict-transport-security')).toBe('max-age=31536000');
		expect(local.response.headers.get('strict-transport-security')).toBeNull();
	});
});

describe('Schema.org', () => {
	it('магазин і сайт — на кожній сторінці, решта — від самої сторінки, одним тегом', async () => {
		const { html } = await request('https://lilylook.store/product/x', {
			jsonLd: [{ '@type': 'Product', name: 'Сукня' }]
		});

		expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
		const json = JSON.parse(html.replace(/^.*?<script[^>]*>|<\/script>.*$/gs, ''));
		expect(json['@graph'].map((node: { '@type': string }) => node['@type'])).toEqual([
			'OnlineStore',
			'WebSite',
			'Product'
		]);
		// Адреси — справжнього домену, з якого прийшов запит.
		expect(JSON.stringify(json)).toContain('https://lilylook.store');
	});

	it('назва з </script> не розриває тег — XSS через назву товару неможливий', async () => {
		const { html } = await request('https://lilylook.store/product/x', {
			jsonLd: [{ '@type': 'Product', name: '</script><script>alert(1)</script>' }]
		});

		expect(html.match(/<\/script>/g)).toHaveLength(1);
	});
});

describe('відвідуваність', () => {
	it('сторінка відкрилась цілком — один перегляд', async () => {
		await request('https://lilylook.store/product/palto');

		expect(track).toHaveBeenCalledWith(visitor, 'view', '/product/palto');
	});

	it('дані для переходу всередині сайту — не перегляд: так само шлються при наведенні курсора', async () => {
		await request('https://lilylook.store/product/palto', { data: true });

		expect(identify).not.toHaveBeenCalled();
		expect(track).not.toHaveBeenCalled();
	});

	it('404, редирект, API й файли — не перегляди', async () => {
		await request('https://lilylook.store/nemaie', { routeId: null });
		await request('https://lilylook.store/checkout', { status: 303 });
		await request('https://lilylook.store/api/search?q=x');
		await request('https://lilylook.store/robots.txt', { contentType: 'text/plain' });

		expect(track).not.toHaveBeenCalled();
	});

	it('бот чи пристрій команди — не рахується', async () => {
		identify.mockReturnValue(null);

		await request('https://lilylook.store/');

		expect(track).not.toHaveBeenCalled();
	});

	it('секретне посилання команди відповідає підтвердженням, а не сторінкою', async () => {
		optOut.mockReturnValue(new Response('Цей пристрій більше не рахується'));

		const { response } = await request('https://lilylook.store/?ne-rahuvaty=key');

		expect(await response.text()).toContain('більше не рахується');
		expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
		expect(track).not.toHaveBeenCalled();
	});
});
