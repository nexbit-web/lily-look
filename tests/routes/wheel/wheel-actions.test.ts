import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Дія `/wheel?/spin`: віддає приз і пише подію `wheel_spin` для статистики. */

const identify = vi.fn();
const track = vi.fn();
const spinWheel = vi.fn();
const visitor = { id: 'abc123def456ghi789jk', source: 'instagram', device: 'mobile' };

vi.mock('$lib/server/analytics', () => ({ identify, track }));
vi.mock('$lib/server/wheel', () => ({ spinWheel }));

const { actions } = await import('$routes/wheel/+page.server');

const prize = (code: string) => ({
	code,
	label: code,
	percent: 0,
	freeDelivery: false,
	expiresAt: ''
});

const spin = () =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions.spin as any)({
		cookies: {},
		url: new URL('https://lilylook.store/wheel'),
		request: new Request('https://lilylook.store/wheel', {
			method: 'POST',
			headers: { 'x-forwarded-for': '93.74.1.2' }
		})
	});

beforeEach(() => {
	vi.clearAllMocks();
	identify.mockReturnValue(visitor);
});

describe('/wheel?/spin', () => {
	it('виграв приз — віддає його й записує, що людина покрутила', async () => {
		spinWheel.mockResolvedValue(prize('off7'));

		await expect(spin()).resolves.toEqual({ prize: prize('off7') });
		expect(track).toHaveBeenCalledWith(visitor, 'wheel_spin', '/wheel');
	});

	it('IP покупця йде в розіграш — для ліміту обертів з однієї адреси', async () => {
		spinWheel.mockResolvedValue(prize('off3'));

		await spin();
		expect(spinWheel).toHaveBeenCalledWith(expect.anything(), '93.74.1.2');
	});

	it('«Ще спроба» — ще не результат, у статистику не йде', async () => {
		spinWheel.mockResolvedValue(prize('retry'));

		await spin();
		expect(track).not.toHaveBeenCalled();
	});

	it('відмова (вже крутив) — нічого не записано', async () => {
		spinWheel.mockResolvedValue(null);

		await expect(spin()).resolves.toEqual({ prize: null });
		expect(track).not.toHaveBeenCalled();
	});
});
