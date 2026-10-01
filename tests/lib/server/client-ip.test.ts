import { clientIp } from '$lib/server/client-ip';
import { describe, expect, it } from 'vitest';

/** IP покупця за проксі хостингу: для реклами й ліміту обертів колеса. */
const event = (headers: Record<string, string>, address?: string) => ({
	request: new Request('https://lilylook.store/', { headers }),
	getClientAddress: address ? () => address : undefined
});

describe('clientIp', () => {
	it('справжня адреса — перша в X-Forwarded-For', () => {
		expect(clientIp(event({ 'x-forwarded-for': '93.74.1.2, 10.0.0.1' }))).toBe('93.74.1.2');
	});

	it('без заголовка — адреса з’єднання', () => {
		expect(clientIp(event({}, '93.74.1.3'))).toBe('93.74.1.3');
	});

	it('локальна адреса (сам проксі) — як жодної', () => {
		expect(clientIp(event({}, '127.0.0.1'))).toBeNull();
		expect(clientIp(event({}, '::1'))).toBeNull();
		expect(clientIp(event({}, '::ffff:127.0.0.1'))).toBeNull();
	});

	it('адресу дізнатись не вдалося — null, а не помилка', () => {
		const broken = {
			request: new Request('https://lilylook.store/'),
			getClientAddress: () => {
				throw new Error('no address');
			}
		};
		expect(clientIp(broken)).toBeNull();
	});
});
