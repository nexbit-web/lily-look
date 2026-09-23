import { beforeEach, describe, expect, it, vi } from 'vitest';

// Кеш вимкнений у режимі розробки — тест має перевіряти робочу поведінку.
vi.mock('$app/environment', () => ({ dev: false }));

const { cached, clearCache } = await import('$lib/server/cache');

beforeEach(() => {
	clearCache();
	vi.useRealTimers();
});

describe('кеш каталогу', () => {
	it('другий запит за тим самим ключем у базу не йде', async () => {
		const load = vi.fn().mockResolvedValue('дані');

		expect(await cached('home', 60_000, load)).toBe('дані');
		expect(await cached('home', 60_000, load)).toBe('дані');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('різні ключі не плутаються', async () => {
		await cached('sukni', 60_000, async () => 'сукні');

		expect(await cached('palto', 60_000, async () => 'пальто')).toBe('пальто');
	});

	it('поки перший запит у дорозі, другий чекає на нього, а не дублює', async () => {
		let release: (value: string) => void = () => {};
		const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));

		const first = cached('home', 60_000, load);
		const second = cached('home', 60_000, load);
		release('дані');

		expect(await first).toBe('дані');
		expect(await second).toBe('дані');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('після того, як час вийшов, дані перечитуються', async () => {
		vi.useFakeTimers();
		const load = vi.fn().mockResolvedValue('дані');

		await cached('home', 1_000, load);
		vi.advanceTimersByTime(1_001);
		await cached('home', 1_000, load);

		expect(load).toHaveBeenCalledTimes(2);
	});

	it('помилка не залипає в кеші', async () => {
		const load = vi.fn().mockRejectedValueOnce(new Error('база впала')).mockResolvedValue('дані');

		await expect(cached('home', 60_000, load)).rejects.toThrow('база впала');

		expect(await cached('home', 60_000, load)).toBe('дані');
		expect(load).toHaveBeenCalledTimes(2);
	});
});
