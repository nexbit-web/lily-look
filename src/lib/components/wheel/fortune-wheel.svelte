<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { BUY_BUTTON } from '$lib/components/product/buy-button';
	import { Button } from '$lib/components/ui/button';
	import { WHEEL_PRIZES } from '$lib/config';
	import type { ActivePrize } from '$lib/types';
	import { cn } from '$lib/utils';
	import { WHEEL_SECTORS, isRetry } from '$lib/wheel';
	import {
		MIN_FREE_SPIN_MS,
		SPIN_UP_MS,
		brakeAngle,
		planBrake,
		pointerAt,
		spinUpAngle,
		type Brake
	} from '$lib/wheel-spin';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import { onDestroy, untrack } from 'svelte';

	/**
	 * Колесо фортуни.
	 *
	 * Натиснули «Крутити» — колесо одразу розганяється й крутиться, поки
	 * сервер вибирає приз (`/wheel?/spin`). Щойно приз відомий, колесо
	 * плавно гальмує й зупиняється рівно на його секторі. На кожному
	 * секторі клацає «тріскачка», а язичок стрілки відскакує — як у
	 * справжнього колеса. Фізика — у `wheel-spin.ts`.
	 *
	 * Обертання — кадрами (requestAnimationFrame), а не CSS-переходом:
	 * переходу потрібна кінцева точка наперед, а її ще немає, поки сервер
	 * думає. І перехід вимикається в системах із «менше анімацій» — а
	 * колесо, що не крутиться, не має сенсу.
	 */
	let {
		/** Уже виграний приз: колесо стоїть на ньому, крутити не можна. */
		won = null,
		onresult,
		onclose
	}: {
		won?: ActivePrize | null;
		/** Колесо зупинилось на призі. «Ще спроба» сюди не приходить — колесо просто крутять знову. */
		onresult?: (prize: ActivePrize) => void;
		/** Кнопка після відмови: у вікні закриває його, на сторінці — веде до курток. */
		onclose?: () => void;
	} = $props();

	const R = 136;
	const BERRY = 'oklch(0.5 0.16 355)';

	/**
	 * Вигляд секторів: знижки — рожевим і пудровим по черзі, доставка —
	 * ягідним, щоб вирізнялась, «Ще спроба» — білий.
	 */
	const sectors = WHEEL_SECTORS.map((sector, index) => {
		const prize = WHEEL_PRIZES[index];
		const retry = isRetry(prize);
		const discountIndex = WHEEL_PRIZES.slice(0, index).filter((item) => item.percent > 0).length;
		const look = prize.freeDelivery
			? { fill: BERRY, ink: '#fff' }
			: retry
				? { fill: '#fff', ink: BERRY }
				: discountIndex % 2
					? { fill: 'var(--brand-soft)', ink: BERRY }
					: { fill: 'var(--brand)', ink: '#fff' };
		const radius = (86 / 320) * 100;
		const angle = (sector.center * Math.PI) / 180;
		return {
			...sector,
			...look,
			labelX: 50 + radius * Math.sin(angle),
			labelY: 50 - radius * Math.cos(angle),
			kind: prize.freeDelivery ? 'delivery' : retry ? 'retry' : 'discount',
			label: prize.freeDelivery ? 'Доставка' : retry ? 'Ще' : `−${prize.percent}%`,
			path: slice(sector.from, sector.to)
		};
	});
	const retrySector = sectors.find((sector) => sector.kind === 'retry');

	/** «Лампочки» на ободі — рівно по колу. */
	const bulbs = Array.from({ length: 24 }, (_, index) => {
		const angle = (index / 24) * Math.PI * 2;
		return { x: 149 * Math.sin(angle), y: -149 * Math.cos(angle), lit: index % 2 === 0 };
	});

	/** Сектор як шматок пирога; кути — від 12-ї години за годинниковою стрілкою. */
	function slice(fromDeg: number, toDeg: number): string {
		const point = (deg: number) => {
			const angle = (deg * Math.PI) / 180;
			return `${(R * Math.sin(angle)).toFixed(2)} ${(-R * Math.cos(angle)).toFixed(2)}`;
		};
		const large = toDeg - fromDeg > 180 ? 1 : 0;
		return `M0 0 L${point(fromDeg)} A${R} ${R} 0 ${large} 1 ${point(toDeg)}Z`;
	}

	const sectorOf = (code: string) =>
		WHEEL_SECTORS.find((sector) => sector.code === code) ?? WHEEL_SECTORS[0];
	const sectorIndexAt = (angle: number) => {
		const point = pointerAt(angle);
		return WHEEL_SECTORS.findIndex((sector) => point < sector.to);
	};

	/**
	 * Де зупинитись після відмови: посередині сектора під стрілкою (не на
	 * межі — там незрозуміло, що випало), але не на «Ще раз». Інакше колесо
	 * пообіцяло б оберт, якого не буде.
	 */
	function restingPoint(angle: number) {
		const index = Math.max(0, sectorIndexAt(angle));
		const sector = WHEEL_SECTORS[index];
		return sector.code === retrySector?.code
			? WHEEL_SECTORS[(index + 1) % WHEEL_SECTORS.length].center
			: sector.center;
	}

	/**
	 * Кут диска. Не `$state`: він змінюється 60 разів на секунду, і гнати
	 * це через реактивність Svelte — зайва робота на кожному кадрі. Цикл
	 * пише його прямо в стиль диска (`paint`).
	 *
	 * Стрілка від початку дивиться в середину сектора (виграного або
	 * першого), а не на стик двох — так колесо виглядає рівно.
	 */
	const initialRotation = untrack(
		() => (360 - (won ? sectorOf(won.code) : WHEEL_SECTORS[0]).center) % 360
	);
	let rotation = initialRotation;
	let disc = $state<HTMLElement | null>(null);

	function paint() {
		disc?.style.setProperty('--rot', `${rotation}deg`);
	}
	let phase = $state<'idle' | 'spinning' | 'braking' | 'done'>(
		untrack(() => (won ? 'done' : 'idle'))
	);
	/** Сервер відмовив: колесо вже крутили. */
	let refused = $state(false);
	/** Випала «Ще спроба» — кнопка кличе крутити знову. */
	let again = $state(false);
	/** Скільки разів випала «Ще спроба»: плашка з'являється заново щоразу. */
	let retries = $state(0);
	/** Сектор, на якому стала стрілка, — блимає рамкою. */
	let landed = $state<string | null>(null);
	const landedSector = $derived(sectors.find((sector) => sector.code === landed));
	/** Відскок язичка стрілки на кожному секторі, у градусах. */
	let kick = $state(0);

	let frame = 0;
	let startedAt = 0;
	let spinBase = 0;
	let brake: Brake | null = null;
	let brakeAt = 0;
	/** Відповідь сервера; `null` — відмова, `undefined` — ще чекаємо. */
	let answer: ActivePrize | null | undefined;
	let lastSector = -1;
	let kickTimer: ReturnType<typeof setTimeout> | undefined;
	let revealTimer: ReturnType<typeof setTimeout> | undefined;

	// ─── Звук ────────────────────────────────────────────────────────────
	// Клацання тріскачки синтезуємо на льоту (Web Audio) — жодного файла.
	// Браузер дозволяє звук лише після дії людини, тож аудіо вмикаємо
	// саме в момент натискання «Крутити».
	let audio: AudioContext | null = null;
	let noise: AudioBuffer | null = null;

	function startAudio() {
		try {
			audio ??= new AudioContext();
			void audio.resume();
			if (!noise) {
				// 25 мс шуму, що швидко згасає, — сухе «клац».
				const length = Math.floor(audio.sampleRate * 0.025);
				noise = audio.createBuffer(1, length, audio.sampleRate);
				const data = noise.getChannelData(0);
				for (let i = 0; i < length; i++) {
					data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 4;
				}
			}
		} catch {
			audio = null;
		}
	}

	function click() {
		if (!audio || !noise) return;
		const source = audio.createBufferSource();
		source.buffer = noise;
		const tone = audio.createBiquadFilter();
		tone.type = 'bandpass';
		tone.frequency.value = 2600;
		tone.Q.value = 1.2;
		const volume = audio.createGain();
		volume.gain.value = 0.9;
		source.connect(tone).connect(volume).connect(audio.destination);
		source.start();
	}

	/** Фанфара на виграш: до-мі-соль-до вгору, як у ігровому автоматі. */
	function chime() {
		if (!audio) return;
		const now = audio.currentTime;
		[1046.5, 1318.5, 1568, 2093].forEach((frequency, index) => {
			if (!audio) return;
			const at = now + index * 0.11;
			const osc = audio.createOscillator();
			const gain = audio.createGain();
			osc.type = 'sine';
			osc.frequency.value = frequency;
			gain.gain.setValueAtTime(0.0001, at);
			gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + (index === 3 ? 0.9 : 0.4));
			osc.connect(gain).connect(audio.destination);
			osc.start(at);
			osc.stop(at + 0.95);
		});
	}

	/** «Ще спроба»: два веселі «буль» угору — не дзвіночок виграшу, але й не тиша. */
	function bloop() {
		if (!audio) return;
		const now = audio.currentTime;
		[
			[440, 880],
			[660, 1320]
		].forEach(([from, to], index) => {
			if (!audio) return;
			const at = now + index * 0.14;
			const osc = audio.createOscillator();
			const gain = audio.createGain();
			osc.type = 'triangle';
			osc.frequency.setValueAtTime(from, at);
			osc.frequency.exponentialRampToValueAtTime(to, at + 0.12);
			gain.gain.setValueAtTime(0.0001, at);
			gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
			osc.connect(gain).connect(audio.destination);
			osc.start(at);
			osc.stop(at + 0.3);
		});
	}

	// ─── Оберт ───────────────────────────────────────────────────────────
	function tickIfCrossed() {
		const index = sectorIndexAt(rotation);
		if (index === lastSector) return;
		if (lastSector !== -1) {
			click();
			kick = -22;
			clearTimeout(kickTimer);
			kickTimer = setTimeout(() => (kick = 0), 60);
		}
		lastSector = index;
	}

	function loop(now: number) {
		if (phase === 'spinning') {
			rotation = spinBase + spinUpAngle(now - startedAt);
			paint();
			// Гальмуємо, коли сервер відповів і колесо досить покрутилось.
			if (answer !== undefined && now - startedAt >= SPIN_UP_MS + MIN_FREE_SPIN_MS) {
				const sector = answer ? sectorOf(answer.code) : null;
				// Трохи вбік від центру сектора — інакше стрілка щоразу
				// зупинялась би рівно посередині, як у автомата.
				const target = sector
					? sector.center + (Math.random() - 0.5) * (sector.to - sector.from) * 0.5
					: restingPoint(rotation);
				brake = planBrake(rotation, target);
				brakeAt = now;
				phase = 'braking';
			}
		} else if (phase === 'braking' && brake) {
			const elapsed = now - brakeAt;
			rotation = brakeAngle(brake, elapsed);
			paint();
			if (elapsed >= brake.durationMs) {
				tickIfCrossed();
				finish();
				return;
			}
		}
		tickIfCrossed();
		frame = requestAnimationFrame(loop);
	}

	/** Пауза після зупинки: покупець має побачити, де стала стрілка, а вже потім — приз. */
	const REVEAL_MS = 1000;

	function finish() {
		phase = 'done';
		if (!answer) {
			refused = true;
			return;
		}
		const prize = answer;
		if (isRetry(prize)) {
			// Ще одна спроба: плашка на колесі, свій звук, кнопка знову активна.
			again = true;
			retries++;
			landed = prize.code;
			phase = 'idle';
			bloop();
			return;
		}
		landed = prize.code;
		chime();
		revealTimer = setTimeout(() => {
			onresult?.(prize);
			// Смужка з таймером у шапці — з даних шару, їх треба оновити.
			void invalidateAll();
		}, REVEAL_MS);
	}

	function spin() {
		startAudio();
		answer = undefined;
		landed = null;
		spinBase = rotation;
		startedAt = performance.now();
		lastSector = sectorIndexAt(rotation);
		phase = 'spinning';
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(loop);
	}

	onDestroy(() => {
		if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
		clearTimeout(kickTimer);
		clearTimeout(revealTimer);
		void audio?.close().catch(() => {});
	});
</script>

<div class="flex flex-col items-center gap-7">
	<!-- Колесо — три шари. Обід із тінню й серединка стоять на місці, а
	     диск із секторами — окремий шар, який крутить відеокарта
	     (CSS-transform), без перемальовки SVG на кожному кадрі. Тому оберт
	     рівний навіть на слабкому телефоні. -->
	<div
		class="[container-type:inline-size] relative size-[min(19rem,calc(100dvh-18rem))] min-w-56 sm:size-[min(20rem,calc(100dvh-18rem))]"
		role="img"
		aria-label="Колесо з призами: {WHEEL_PRIZES.map((prize) => prize.label).join(', ')}"
	>
		<!-- Язичок стрілки: відскакує на кожному секторі. -->
		<svg
			viewBox="0 0 30 40"
			class="absolute -top-3 left-1/2 z-10 h-11 w-8 -translate-x-1/2 drop-shadow-md"
			aria-hidden="true"
		>
			<g
				style="transform: rotate({kick}deg); transform-origin: 15px 12px; transition: transform {kick
					? 30
					: 120}ms ease-out;"
			>
				<path d="M15 38 L5 14 A11 11 0 1 1 25 14 Z" fill="var(--foreground)" />
				<circle cx="15" cy="12" r="4.5" fill="#fff" />
			</g>
		</svg>

		<!-- Обід із «лампочками» й тінню — нерухомий. -->
		<svg
			viewBox="-160 -160 320 320"
			class="absolute inset-0 size-full drop-shadow-[0_12px_28px_rgba(190,60,110,0.25)]"
			aria-hidden="true"
		>
			<defs>
				<radialGradient id="wheel-rim" r="0.5">
					<stop offset="0.86" stop-color="#fff" />
					<stop offset="1" stop-color="var(--brand-soft)" />
				</radialGradient>
			</defs>
			<circle r="158" fill="url(#wheel-rim)" />
			<circle r="158" fill="none" stroke="var(--brand-soft)" stroke-width="2" />
			{#each bulbs as bulb, index (index)}
				<circle
					cx={bulb.x}
					cy={bulb.y}
					r="3.2"
					fill={bulb.lit ? '#fff' : 'var(--brand)'}
					stroke="var(--brand)"
					stroke-width="1"
				/>
			{/each}
		</svg>

		<!-- Диск. Кут — змінна --rot, її пише цикл кадрів напряму, повз Svelte. -->
		<div
			bind:this={disc}
			data-slot="wheel-disc"
			class="absolute inset-0 will-change-transform"
			style="--rot: {initialRotation}deg; transform: rotate(var(--rot));"
			aria-hidden="true"
		>
			<svg viewBox="-160 -160 320 320" class="size-full">
				{#each sectors as sector (sector.code)}
					<path d={sector.path} fill={sector.fill} stroke="#fff" stroke-width="2.5" />
				{/each}
				<circle r={R} fill="none" stroke="#fff" stroke-width="3" />
				{#if landedSector}
					<!-- Сектор, на якому стала стрілка, — блимає рамкою. -->
					<path
						d={landedSector.path}
						fill="none"
						stroke={BERRY}
						stroke-width="5"
						stroke-linejoin="round"
						class="animate-pulse"
					/>
				{/if}
			</svg>

			<!-- Написи їдуть разом із диском, але повертаються назад на той
			     самий кут — тож завжди стоять рівно, не догори ногами. -->
			{#each sectors as sector (sector.code)}
				<span
					class="absolute flex flex-col items-center leading-none font-bold whitespace-nowrap will-change-transform"
					style="left: {sector.labelX}%; top: {sector.labelY}%; color: {sector.ink}; transform: translate(-50%, -50%) rotate(calc(-1 * var(--rot)));"
				>
					{#if sector.kind === 'delivery'}
						<span class="text-[4.4cqw]">{sector.label}</span>
						<span class="mt-[0.6cqw] text-[3.1cqw] font-medium opacity-90">безкоштовно</span>
					{:else if sector.kind === 'retry'}
						<span class="text-[6cqw]">{sector.label}</span>
						<span class="mt-[0.4cqw] text-[4.2cqw] font-semibold">раз</span>
					{:else}
						<span class="text-[8.1cqw] tracking-tight">{sector.label}</span>
					{/if}
				</span>
			{/each}
		</div>

		<!-- Серединка з монограмою — нерухома. -->
		<svg viewBox="-160 -160 320 320" class="absolute inset-0 size-full" aria-hidden="true">
			<defs>
				<radialGradient id="wheel-hub">
					<stop offset="0.6" stop-color="#fff" />
					<stop offset="1" stop-color="#f6eef1" />
				</radialGradient>
			</defs>
			<circle r="30" fill="url(#wheel-hub)" stroke="var(--brand-soft)" stroke-width="3" />
			<text
				y="6"
				text-anchor="middle"
				font-size="17"
				letter-spacing="1"
				font-family="var(--font-heading)"
				fill="var(--foreground)">LL</text
			>
		</svg>

		{#if again && phase === 'idle'}
			<!-- Подія, а не підпис дрібним шрифтом: плашка вискакує посеред
			     колеса, щоб було видно — оберт не згорів, буде ще один. -->
			{#key retries}
				<div
					data-slot="wheel-again"
					aria-live="polite"
					class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
				>
					<div
						class="animate-in rounded-2xl bg-white/95 px-5 py-3 text-center shadow-xl ring-2 ring-brand duration-300 ease-out zoom-in-50 fade-in"
					>
						<RotateCwIcon class="mx-auto size-6 text-brand" aria-hidden="true" />
						<p class="mt-1 font-heading text-2xl leading-tight">Ще одна спроба!</p>
						<p class="mt-0.5 text-xs text-muted-foreground">Колесо дарує вам ще один оберт</p>
					</div>
				</div>
			{/key}
		{/if}
	</div>

	{#if refused}
		<div data-slot="wheel-refused" class="w-full text-center">
			<p class="font-medium">Ви вже крутили колесо</p>
			<p class="mt-1 text-sm text-muted-foreground">Його можна крутити лише один раз.</p>
			<Button
				href={onclose ? undefined : '/collection/winter'}
				onclick={onclose}
				size="lg"
				class="mt-5 h-12 w-full rounded-full text-base"
			>
				До покупок
			</Button>
		</div>
	{:else}
		<form
			method="POST"
			action="/wheel?/spin"
			class="w-full"
			use:enhance={() => {
				spin();
				return async ({ result }) => {
					answer =
						result.type === 'success' && result.data?.prize
							? (result.data.prize as ActivePrize)
							: null;
				};
			}}
		>
			<Button
				type="submit"
				size="lg"
				class={cn(BUY_BUTTON, 'h-12 w-full text-base', again && phase === 'idle' && 'nudge')}
				disabled={phase !== 'idle'}
			>
				{#if phase === 'done'}
					Вітаємо!
				{:else if phase !== 'idle'}
					Крутиться…
				{:else if again}
					<RotateCwIcon class="size-5" aria-hidden="true" />
					Крутити ще раз
				{:else}
					Крутити колесо
				{/if}
			</Button>
		</form>
	{/if}
</div>
