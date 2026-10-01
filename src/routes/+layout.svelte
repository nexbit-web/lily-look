<script lang="ts">
	// Стилі nprogress не імпортуємо — фірмова смужка описана в app.css.
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import Footer from '$lib/components/layout/footer.svelte';
	import Header from '$lib/components/layout/header.svelte';
	import PrizeBar from '$lib/components/wheel/prize-bar.svelte';
	import { WHEEL_DELAY_MS } from '$lib/config';
	import notoCyrillic from '@fontsource-variable/noto-sans/files/noto-sans-cyrillic-wght-normal.woff2?url';
	import playfairCyrillic from '@fontsource-variable/playfair-display/files/playfair-display-cyrillic-wght-normal.woff2?url';
	import nprogress from 'nprogress';
	import type { Component } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	nprogress.configure({ showSpinner: false, minimum: 0.15, speed: 400 });

	/**
	 * Відвідуваність: перехід на іншу сторінку всередині сайту. Перший показ
	 * уже порахував сервер. `sendBeacon` браузер відправляє сам, у фоні й
	 * уже після показу сторінки — на швидкість переходу це не впливає.
	 * Зміна фільтра чи сортування на тій самій сторінці — не новий перегляд.
	 */
	afterNavigate(({ type, from, to }) => {
		if (type === 'enter' || !to || from?.url.pathname === to.url.pathname) return;
		navigator.sendBeacon?.('/api/view', to.url.pathname);
		// Друга сторінка — людина зацікавилась: саме час для колеса.
		void showWheel();
	});

	/**
	 * Колесо фортуни для нового відвідувача: через 25 секунд на сайті або на
	 * другій сторінці — що настане раніше. Не з порога: спершу людина має
	 * побачити куртку, по яку прийшла з реклами. І ніколи не посеред
	 * оформлення — там воно лише заважало б купити.
	 *
	 * Сам компонент вантажиться лише тоді, коли вікно справді відкривається:
	 * тим, хто колесо вже бачив, він не коштує ані байта.
	 */
	const WHEEL_SKIP = ['/cart', '/checkout', '/order', '/setup', '/wheel'];
	let Wheel = $state<Component<{ open?: boolean; onclose?: () => void }> | null>(null);
	let wheelOpen = $state(false);
	let wheelShown = false;

	async function showWheel() {
		const path = page.url.pathname;
		const skip = WHEEL_SKIP.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
		if (wheelShown || !data.wheelEligible || skip) return;
		wheelShown = true;
		Wheel = (await import('$lib/components/wheel/wheel-dialog.svelte')).default;
		wheelOpen = true;
		// Для статистики колеса: показали — і поверх якої сторінки.
		navigator.sendBeacon?.('/api/wheel', path);
	}

	$effect(() => {
		if (!data.wheelEligible) return;
		const timer = setTimeout(showWheel, WHEEL_DELAY_MS);
		return () => clearTimeout(timer);
	});

	/** Закрили вікно — більше не показуємо (виграш і так ставить цю куку на сервері). */
	function wheelClosed() {
		document.cookie = 'lily_wheel=1; path=/; max-age=31536000; samesite=lax';
	}

	/**
	 * Тости з'являються лише у відповідь на дію покупця, тож бібліотеку
	 * підвантажуємо вже після гідратації — вона не має важити на першому екрані.
	 */
	let Toaster = $state<Component<Record<string, unknown>> | null>(null);

	$effect(() => {
		let alive = true;
		import('svelte-hot-french-toast').then((module) => {
			if (alive) Toaster = module.Toaster;
		});
		return () => {
			alive = false;
		};
	});

	// Смужка прогресу з'являється тільки на переходах, довших за 120 мс:
	// на швидких навігаціях блимання дратує сильніше, ніж допомагає.
	$effect(() => {
		if (!navigating.to) {
			nprogress.done();
			return;
		}

		const timer = setTimeout(() => nprogress.start(), 120);
		return () => {
			clearTimeout(timer);
			nprogress.done();
		};
	});
</script>

<!--
	Два шрифти, якими набрано майже все на екрані: український текст і
	заголовки. Без підказки браузер знаходить їх лише після розбору стилів і
	розкладки — вони приїжджали на ~1.7 с, і сторінка перемальовувалась
	заново. Латиницю (цифри, логотип) не підтягуємо наперед: на повільному
	4G вона відбирала б канал у головного фото.
-->
<svelte:head>
	<link rel="preload" href={notoCyrillic} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={playfairCyrillic} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<div class="flex min-h-screen flex-col">
	{#if data.prize && !page.url.pathname.startsWith('/order/')}
		<!-- Смужка виїжджає плавно, а не штовхає сторінку вниз ривком. -->
		<div in:slide={{ duration: 450 }}>
			<PrizeBar prize={data.prize} cartCount={data.cartCount} />
		</div>
	{/if}

	<Header categories={data.categories} cartCount={data.cartCount} />

	<main class="flex-1">
		{@render children()}
	</main>

	<Footer categories={data.categories} />
</div>

{#if Wheel}
	<Wheel bind:open={wheelOpen} onclose={wheelClosed} />
{/if}

{#if Toaster}
	<Toaster
		position="top-center"
		toastOptions={{
			duration: 3000,
			class: 'app-toast',
			style:
				'background: var(--card); color: var(--foreground); box-shadow: 0 4px 16px -4px rgba(0,0,0,0.25); padding: 10px 14px; font-size: 13.5px; border-radius: 1rem;',
			iconTheme: {
				primary: 'var(--primary)',
				secondary: 'var(--primary-foreground)'
			}
		}}
	/>
{/if}
