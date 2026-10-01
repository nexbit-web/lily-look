<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Конфеті на весь екран — свято, коли колесо подарувало приз.
	 *
	 * Бібліотека `canvas-confetti`: сама кладе полотно поверх сторінки
	 * (`position: fixed` прямо в `body`, тож `transform` вікна діалогу їй не
	 * заважає) і сама його прибирає, щойно все впало. Клацання крізь конфеті
	 * проходять. Вантажимо її лише в момент виграшу — решті відвідувачів
	 * вона не потрібна.
	 *
	 * Три шари: залпи з обох боків екрана, дощ зверху на всю ширину і
	 * наприкінці ще кілька зірочок — щоб розсипалось, а не бахнуло й зникло.
	 */

	// Насичені кольори: на білому вікні й сірому тлі пастель губилась.
	// Білого немає — на білому його не видно.
	const COLORS = ['#ff2d87', '#ff6fb5', '#c2185b', '#ffc400', '#ff8f00', '#8e24aa', '#00bfa5'];

	onMount(() => {
		let stopped = false;
		const timers: ReturnType<typeof setTimeout>[] = [];
		const later = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));

		void import('canvas-confetti').then(({ default: confetti }) => {
			if (stopped) return;
			const shared = {
				colors: COLORS,
				zIndex: 100,
				disableForReducedMotion: false,
				shapes: ['square', 'circle'] as confetti.Shape[],
				scalar: 1.15
			};

			// Залпи з боків — навскіс угору, до центру екрана.
			const sides = () => {
				confetti({
					...shared,
					particleCount: 60,
					angle: 60,
					spread: 55,
					startVelocity: 62,
					origin: { x: 0, y: 0.75 }
				});
				confetti({
					...shared,
					particleCount: 60,
					angle: 120,
					spread: 55,
					startVelocity: 62,
					origin: { x: 1, y: 0.75 }
				});
			};
			sides();
			later(350, sides);

			// Дощ зверху на всю ширину — повільно кружляє й розсипається.
			const end = Date.now() + 2200;
			const rain = () => {
				if (stopped) return;
				confetti({
					...shared,
					particleCount: 6,
					angle: 270,
					spread: 40,
					startVelocity: 8,
					gravity: 0.7,
					drift: Math.random() - 0.5,
					ticks: 420,
					origin: { x: Math.random(), y: -0.05 }
				});
				if (Date.now() < end) later(60, rain);
			};
			rain();

			// Зірочки наостанок.
			later(700, () =>
				confetti({
					...shared,
					shapes: ['star'],
					particleCount: 40,
					spread: 120,
					startVelocity: 35,
					scalar: 1.3,
					origin: { x: 0.5, y: 0.35 }
				})
			);
		});

		return () => {
			stopped = true;
			// Те, що вже летить, хай долетить, навіть якщо вікно закрили.
			timers.forEach(clearTimeout);
		};
	});
</script>
