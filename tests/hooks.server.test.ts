import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Хук бачить кожен запит: без бази — на інструкцію, заголовки безпеки —
 * на кожну відповідь, розмітка Schema.org — рівно один тег на сторінку.
 */

let configured = true;

vi.mock('$lib/server/db', () => ({ isDatabaseConfigured: () => configured }));

const { handle } = await import('$src/hooks.server');

const PAGE = '<html><head>%lily.jsonld%</head><body></body></html>';

async function request(path: string, jsonLd?: Record<string, unknown>[]) {
	const url = new URL(path);
	const event = { url, locals: { jsonLd } } as unknown as RequestEvent;
	let html = '';
	const response = await handle({
		event,
		resolve: async (_event, options) => {
			html = (await options?.transformPageChunk?.({ html: PAGE, done: true })) ?? PAGE;
			return new Response(html);
		}
	});
	return { response, html };
}

beforeEach(() => {
	configured = true;
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
		const { html } = await request('https://lilylook.store/product/x', [
			{ '@type': 'Product', name: 'Сукня' }
		]);

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
		const { html } = await request('https://lilylook.store/product/x', [
			{ '@type': 'Product', name: '</script><script>alert(1)</script>' }
		]);

		expect(html.match(/<\/script>/g)).toHaveLength(1);
	});
});
