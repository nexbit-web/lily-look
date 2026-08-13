import { SENDER } from '$lib/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Чужий API — найненадійніша частина чекауту. Перевіряємо, що ключ не тече
 * назовні, помилки не валять сторінку, а довідник кешується.
 */

const env = { NOVA_POSHTA_API_KEY: 'secret-key' } as Record<string, string | undefined>;
vi.mock('$env/dynamic/private', () => ({ env }));

const {
	estimateDeliveryPrice,
	isNovaPoshtaConfigured,
	listWarehouses,
	NovaPoshtaError,
	searchSettlements
} = await import('./nova-poshta.js');

const fetchMock = vi.fn();

function reply(payload: unknown, ok = true) {
	return { ok, status: 200, json: async () => payload } as unknown as Response;
}

/** Кожен тест бере унікальний запит — інакше спрацює кеш попереднього. */
let unique = 0;
const term = () => `Місто${++unique}`;

beforeEach(() => {
	env.NOVA_POSHTA_API_KEY = 'secret-key';
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('налаштування', () => {
	it('без ключа функція-прапорець каже «ні»', () => {
		env.NOVA_POSHTA_API_KEY = '';
		expect(isNovaPoshtaConfigured()).toBe(false);
	});

	it('без ключа запит навіть не летить', async () => {
		env.NOVA_POSHTA_API_KEY = '';
		await expect(searchSettlements(term())).rejects.toBeInstanceOf(NovaPoshtaError);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('searchSettlements', () => {
	it('короткий запит не витрачає квоту', async () => {
		await expect(searchSettlements('О')).resolves.toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('віддає ref населеного пункту й окремо ref міста', async () => {
		fetchMock.mockResolvedValue(
			reply({
				success: true,
				data: [
					{
						Addresses: [
							{
								Ref: 'settlement-ref',
								DeliveryCity: 'city-ref',
								MainDescription: 'Роздільна',
								Area: 'Одеська',
								Region: 'Роздільнянський',
								Warehouses: 26
							}
						]
					}
				]
			})
		);

		const [first] = await searchSettlements(term());

		expect(first).toMatchObject({ ref: 'settlement-ref', cityRef: 'city-ref', name: 'Роздільна' });
		expect(first.region).toBe('Одеська обл., Роздільнянський р-н');
	});

	it('ховає населені пункти без відділень', async () => {
		fetchMock.mockResolvedValue(
			reply({
				success: true,
				data: [
					{
						Addresses: [
							{
								Ref: 'a',
								DeliveryCity: 'a',
								MainDescription: 'Село',
								Area: '',
								Region: '',
								Warehouses: 0
							}
						]
					}
				]
			})
		);

		await expect(searchSettlements(term())).resolves.toEqual([]);
	});

	it('однаковий запит другий раз бере з кешу', async () => {
		fetchMock.mockResolvedValue(reply({ success: true, data: [{ Addresses: [] }] }));
		const query = term();

		await searchSettlements(query);
		await searchSettlements(query);

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('ключ іде тільки в тіло запиту до НП і нікуди більше', async () => {
		fetchMock.mockResolvedValue(reply({ success: true, data: [{ Addresses: [] }] }));
		await searchSettlements(term());

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe('https://api.novaposhta.ua/v2.0/json/');
		expect(String(url)).not.toContain('secret-key');
		expect(JSON.parse(init.body).apiKey).toBe('secret-key');
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});
});

describe('listWarehouses', () => {
	it('питає відділення саме за Ref населеного пункту', async () => {
		fetchMock.mockResolvedValue(
			reply({
				success: true,
				data: [
					{ Ref: 'w1', Number: '12', Description: 'Відділення № 12', ShortAddress: 'вул. Миру' }
				]
			})
		);

		const warehouses = await listWarehouses('settlement-ref', term());

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.methodProperties.SettlementRef).toBe('settlement-ref');
		expect(warehouses[0]).toMatchObject({ ref: 'w1', number: '12' });
	});

	it('без ref не ходить у мережу', async () => {
		await expect(listWarehouses('', 'щось')).resolves.toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('помилки', () => {
	it('тротлінг перетворює на 429, а не на 500', async () => {
		fetchMock.mockResolvedValue(reply({ success: false, errors: ['Too many requests'] }));

		await expect(searchSettlements(term())).rejects.toMatchObject({ status: 429 });
	});

	it('мережева помилка стає зрозумілим текстом', async () => {
		fetchMock.mockRejectedValue(new Error('ECONNRESET'));

		await expect(searchSettlements(term())).rejects.toMatchObject({
			message: expect.stringContaining('Нова Пошта не відповідає')
		});
	});

	it('поганий HTTP-статус теж не пролазить далі', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as Response);

		await expect(searchSettlements(term())).rejects.toBeInstanceOf(NovaPoshtaError);
	});
});

describe('estimateDeliveryPrice', () => {
	it('рахує від міста відправника й повертає копійки', async () => {
		fetchMock.mockResolvedValue(reply({ success: true, data: [{ Cost: 98 }] }));

		const cost = await estimateDeliveryPrice({
			cityRef: 'city-ref',
			declaredValue: 159_900,
			itemCount: 2,
			toDoors: false
		});

		expect(cost).toBe(9800);

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.methodProperties).toMatchObject({
			CitySender: SENDER.cityRef,
			CityRecipient: 'city-ref',
			ServiceType: 'WarehouseWarehouse',
			// оголошена вартість — у гривнях, у нас усе в копійках
			Cost: '1599'
		});
	});

	it('на будь-який збій віддає null — чекаут не має падати', async () => {
		fetchMock.mockRejectedValue(new Error('таймаут'));

		await expect(
			estimateDeliveryPrice({
				cityRef: 'city-ref',
				declaredValue: 100_000,
				itemCount: 1,
				toDoors: true
			})
		).resolves.toBeNull();
	});

	it('без ключа мовчки повертає null', async () => {
		env.NOVA_POSHTA_API_KEY = '';

		await expect(
			estimateDeliveryPrice({
				cityRef: 'city-ref',
				declaredValue: 100_000,
				itemCount: 1,
				toDoors: false
			})
		).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
