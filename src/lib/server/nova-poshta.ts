import { env } from '$env/dynamic/private';
import { SENDER } from '$lib/config';
import type { SettlementOption, WarehouseOption } from '$lib/types';

/**
 * Нова Пошта, API v2.0 — тільки довідник адрес.
 *
 * Потрібні рівно дві речі: підказати населений пункт і його відділення,
 * щоб менеджер отримав точну адресу. Накладні не створюємо — для цього
 * знадобився б окремий договір і зовсім інший набір методів.
 *
 * Ключ безкоштовний: кабінет НП → Налаштування → Безпека → Ключі API.
 * Документація: https://developers.novaposhta.ua
 */

const ENDPOINT = 'https://api.novaposhta.ua/v2.0/json/';
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 400;

export class NovaPoshtaError extends Error {
	constructor(
		message: string,
		readonly status = 502
	) {
		super(message);
	}
}

/** Довідник змінюється раз на місяці — кеш економить квоту й прибирає лаг. */
class TtlCache<T> {
	#store = new Map<string, { value: T; expires: number }>();

	get(key: string): T | undefined {
		const hit = this.#store.get(key);
		if (!hit) return undefined;
		if (hit.expires < Date.now()) {
			this.#store.delete(key);
			return undefined;
		}
		return hit.value;
	}

	set(key: string, value: T): void {
		if (this.#store.size >= CACHE_MAX_ENTRIES) {
			const oldest = this.#store.keys().next().value;
			if (oldest !== undefined) this.#store.delete(oldest);
		}
		this.#store.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
	}
}

const settlementsCache = new TtlCache<SettlementOption[]>();
const warehousesCache = new TtlCache<WarehouseOption[]>();

type ApiResponse<T> = { success: boolean; data: T[]; errors?: string[] };

type SettlementRow = {
	/** Ref населеного пункту — саме він потрібен для getWarehouses. */
	Ref: string;
	/** Ref міста — інший ідентифікатор, потрібен для getDocumentPrice. */
	DeliveryCity: string;
	MainDescription: string;
	Area: string;
	Region: string;
	Warehouses: number;
};

type WarehouseRow = {
	Ref: string;
	Number: string;
	Description: string;
	ShortAddress: string;
};

export function isNovaPoshtaConfigured(): boolean {
	return Boolean(env.NOVA_POSHTA_API_KEY);
}

async function call<T>(
	modelName: string,
	calledMethod: string,
	methodProperties: object
): Promise<T[]> {
	const apiKey = env.NOVA_POSHTA_API_KEY;
	if (!apiKey) throw new NovaPoshtaError('Ключ Нової Пошти не налаштований', 503);

	let response: Response;
	try {
		// Таймаут обов'язковий: без нього чекаут висне, якщо API НП лягло.
		response = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch {
		throw new NovaPoshtaError('Нова Пошта не відповідає. Спробуйте пізніше.');
	}

	if (!response.ok) throw new NovaPoshtaError(`Нова Пошта повернула ${response.status}`);

	const payload = (await response.json()) as ApiResponse<T>;
	if (!payload.success) {
		const reason = payload.errors?.[0] ?? '';
		// НП тротлить часті запити — це не помилка даних, а сигнал зачекати.
		if (/many requests/i.test(reason)) {
			throw new NovaPoshtaError('Забагато запитів до Нової Пошти. Спробуйте за мить.', 429);
		}
		throw new NovaPoshtaError(reason || 'Нова Пошта відхилила запит');
	}

	return payload.data;
}

export async function searchSettlements(query: string): Promise<SettlementOption[]> {
	const term = query.trim();
	if (term.length < 2) return [];

	const cacheKey = term.toLowerCase();
	const cached = settlementsCache.get(cacheKey);
	if (cached) return cached;

	const data = await call<{ Addresses: SettlementRow[] }>('AddressGeneral', 'searchSettlements', {
		CityName: term,
		Limit: '20'
	});

	const settlements = (data[0]?.Addresses ?? [])
		// Населений пункт без відділень у списку тільки заважає.
		.filter((row) => row.Warehouses > 0)
		.map((row) => ({
			ref: row.Ref,
			cityRef: row.DeliveryCity,
			name: row.MainDescription,
			region: [row.Area && `${row.Area} обл.`, row.Region && `${row.Region} р-н`]
				.filter(Boolean)
				.join(', ')
		}));

	settlementsCache.set(cacheKey, settlements);
	return settlements;
}

export async function listWarehouses(
	settlementRef: string,
	query = ''
): Promise<WarehouseOption[]> {
	if (!settlementRef) return [];

	const term = query.trim();
	const cacheKey = `${settlementRef}:${term.toLowerCase()}`;
	const cached = warehousesCache.get(cacheKey);
	if (cached) return cached;

	// Ключовий момент: SettlementRef — це Ref із searchSettlements.
	// Якщо підставити DeliveryCity (ref міста), API поверне порожній список.
	const rows = await call<WarehouseRow>('AddressGeneral', 'getWarehouses', {
		SettlementRef: settlementRef,
		FindByString: term,
		Limit: '50',
		Page: '1'
	});

	const warehouses = rows.map((row) => ({
		ref: row.Ref,
		number: row.Number,
		description: row.Description || row.ShortAddress
	}));

	warehousesCache.set(cacheKey, warehouses);
	return warehouses;
}

/** Середня вага одиниці одягу в кг — НП рахує тариф за вагою й об'ємом. */
const ITEM_WEIGHT_KG = 0.5;

const priceCache = new TtlCache<number>();

type PriceRow = { Cost: number };

/**
 * Реальний тариф Нової Пошти для конкретного напрямку.
 *
 * Повертає копійки або null, якщо API недоступне — тоді викликач
 * підставляє фіксований тариф із config і замовлення не блокується.
 */
export async function estimateDeliveryPrice(options: {
	cityRef: string;
	/** Оголошена вартість у копійках. */
	declaredValue: number;
	itemCount: number;
	toDoors: boolean;
}): Promise<number | null> {
	const { cityRef, declaredValue, itemCount, toDoors } = options;
	if (!cityRef || !isNovaPoshtaConfigured()) return null;

	const weight = Math.max(ITEM_WEIGHT_KG, itemCount * ITEM_WEIGHT_KG);
	const cacheKey = `price:${cityRef}:${toDoors}:${weight}:${Math.round(declaredValue / 10000)}`;
	const cached = priceCache.get(cacheKey);
	if (cached !== undefined) return cached;

	try {
		const rows = await call<PriceRow>('InternetDocument', 'getDocumentPrice', {
			CitySender: SENDER.cityRef,
			CityRecipient: cityRef,
			ServiceType: toDoors ? 'WarehouseDoors' : 'WarehouseWarehouse',
			CargoType: 'Cargo',
			Weight: String(weight),
			// НП очікує гривні, у нас усе в копійках.
			Cost: String(Math.round(declaredValue / 100)),
			SeatsAmount: String(itemCount)
		});

		const cost = rows[0]?.Cost;
		if (typeof cost !== 'number') return null;

		const kopiyky = Math.round(cost * 100);
		priceCache.set(cacheKey, kopiyky);
		return kopiyky;
	} catch {
		// Тариф — не критична частина: краще показати базову ціну,
		// ніж завалити чекаут через недоступність стороннього API.
		return null;
	}
}
