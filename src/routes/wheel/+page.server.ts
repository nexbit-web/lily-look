import { identify, track } from '$lib/server/analytics';
import { clientIp } from '$lib/server/client-ip';
import { spinWheel } from '$lib/server/wheel';
import { isRetry } from '$lib/wheel';
import type { Actions } from './$types';

/**
 * Колесо фортуни. Зазвичай його крутять у вікні поверх будь-якої сторінки
 * (форма шле сюди через `use:enhance`), а ця сторінка — для посилання
 * напряму («Крутни колесо» в Instagram) і для браузера без JS: форма
 * працює й так, результат покажеться після перезавантаження.
 *
 * `prize: null` — колесо вже крутили. Чинний приз — у даних шару
 * (`+layout.server.ts`), тож окремий load не потрібен.
 */
export const actions: Actions = {
	spin: async (event) => {
		const prize = await spinWheel(event.cookies, clientIp(event));

		// Для статистики колеса: хто покрутив і виграв. «Ще спроба» — ще не
		// результат, повторне натискання з тим самим призом звіти не
		// подвоїть — там рахуються люди, а не події.
		if (prize && !isRetry(prize)) {
			const visitor = identify(event);
			if (visitor) track(visitor, 'wheel_spin', '/wheel');
		}

		return { prize };
	}
};
