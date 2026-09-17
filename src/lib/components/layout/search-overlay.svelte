<script lang="ts">
	import { goto, preloadData } from '$app/navigation';
	import { page } from '$app/state';
	import { SEARCH_MIN_LENGTH } from '$lib/config';
	import { IMAGE_SMALL, imageSrc } from '$lib/image';
	import { formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { CategoryLink, ProductCard } from '$lib/types';
	import { cn } from '$lib/utils';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';

	/**
	 * Пошук по каталогу.
	 *
	 * Підказки — товари, а не категорії: людина шукає річ, а полиця в неї
	 * вже є в меню. Запит іде тільки тоді, коли щось набрали (і не раніше,
	 * ніж пальці зупинились), кожна відповідь лишається в пам'яті, а
	 * попередня скасовується — тож швидке друкування не тягне за собою
	 * шлейф зайвих запитів.
	 */

	let { open = $bindable(false), categories }: { open?: boolean; categories: CategoryLink[] } =
		$props();

	/** Скільки чекати після останньої натиснутої літери. */
	const DEBOUNCE_MS = 140;
	/** Скільки останніх запитів пам'ятаємо в браузері. */
	const RECENT_LIMIT = 5;
	const RECENT_KEY = 'lily_recent_searches';

	let query = $state('');
	let input = $state<HTMLInputElement>();
	let panel = $state<HTMLElement>();

	let results = $state<ProductCard[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let failed = $state(false);
	/** Запит, на який уже є відповідь: до нього прив'язана видача. */
	let answered = $state('');
	/** Підсвічений рядок для клавіатури; −1 — жодного. */
	let cursor = $state(-1);

	let recent = $state<string[]>([]);

	const term = $derived(query.trim());
	const short = $derived(term.length < SEARCH_MIN_LENGTH);
	/** Видача застаріла, поки відповідь не наздогнала введене. */
	const fresh = $derived(answered === term);
	const empty = $derived(!short && fresh && results.length === 0 && !failed);

	/**
	 * Рядки, по яких ходить клавіатура: спершу товари, останній — «шукати
	 * все». Enter на будь-якому веде туди ж, куди й клік.
	 */
	const rows = $derived([
		...results.map((product) => ({ href: `/product/${product.slug}` })),
		...(short ? [] : [{ href: `/catalog?q=${encodeURIComponent(term)}` }])
	]);

	/** Швидкі посилання, коли ще нічого не ввели. */
	const quickLinks = $derived([
		...categories.slice(0, 4).map((category) => ({
			label: category.name,
			href: `/catalog/${category.slug}`
		})),
		{ label: 'Новинки', href: '/catalog?sort=new' },
		{ label: 'Знижки', href: '/catalog?sale=1' }
	]);

	/**
	 * Відповіді на вже набрані запити. Повернувся на літеру назад —
	 * підказки з'являються без жодного запиту.
	 */
	type Answer = { items: ProductCard[]; total: number };
	// Свідомо звичайний об'єкт, а не Map: цей кеш не має бути реактивним —
	// видачу оновлює `apply`, а не сам факт запису у сховище.
	const memo: Record<string, Answer> = {};
	let inFlight: AbortController | null = null;

	function apply(key: string, data: Answer) {
		results = data.items;
		total = data.total;
		answered = key;
		failed = false;
		cursor = -1;
	}

	$effect(() => {
		const key = term;

		if (key.length < SEARCH_MIN_LENGTH) {
			inFlight?.abort();
			inFlight = null;
			loading = false;
			results = [];
			total = 0;
			answered = key;
			return;
		}

		const known = memo[key];
		if (known) {
			apply(key, known);
			loading = false;
			return;
		}

		loading = true;
		const timer = setTimeout(async () => {
			// Попередній запит уже не потрібен: покупець набрав далі.
			inFlight?.abort();
			const controller = new AbortController();
			inFlight = controller;

			try {
				const response = await fetch(`/api/search?q=${encodeURIComponent(key)}`, {
					signal: controller.signal
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const data = (await response.json()) as Answer;
				memo[key] = data;
				apply(key, data);
			} catch (error) {
				if ((error as Error)?.name === 'AbortError') return;
				failed = true;
				answered = key;
			} finally {
				if (inFlight === controller) {
					inFlight = null;
					loading = false;
				}
			}
		}, DEBOUNCE_MS);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!open) return;
		// Фокус після появи панелі, інакше Safari його з'їдає. Текст одразу
		// виділяємо: попередній запит видно (зручно повторити чи дописати),
		// але наступна літера його заміняє, а не приклеюється в кінець.
		requestAnimationFrame(() => {
			input?.focus();
			input?.select();
		});
		recent = readRecent();
	});

	// Закриваємо панель після будь-якої навігації. Перший прогін ефекту
	// пропускаємо: компонент монтується вже відкритим (його підвантажують
	// у момент кліку), і без цієї перевірки він гасив би сам себе одразу.
	let lastUrl = page.url.href;
	$effect(() => {
		const href = page.url.href;
		if (href === lastUrl) return;
		lastUrl = href;
		open = false;
	});

	function readRecent(): string[] {
		try {
			const raw = localStorage.getItem(RECENT_KEY);
			const parsed: unknown = raw ? JSON.parse(raw) : [];
			if (!Array.isArray(parsed)) return [];
			return parsed
				.filter((item): item is string => typeof item === 'string')
				.slice(0, RECENT_LIMIT);
		} catch {
			// Приватне вікно або заблоковані дані сайту — просто без історії.
			return [];
		}
	}

	function remember(value: string) {
		const next = [value, ...recent.filter((item) => item !== value)].slice(0, RECENT_LIMIT);
		recent = next;
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(next));
		} catch {
			// Не змогли запам'ятати — не привід ламати пошук.
		}
	}

	function forgetAll() {
		recent = [];
		try {
			localStorage.removeItem(RECENT_KEY);
		} catch {
			// Те саме: історія — приємність, а не обов'язок.
		}
	}

	function go(href: string) {
		if (term) remember(term);
		open = false;
		goto(href);
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (short) return;
		// Підсвічений рядок головніший за саму форму: людина його обрала.
		go(rows[cursor]?.href ?? `/catalog?q=${encodeURIComponent(term)}`);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			open = false;
			return;
		}
		if (rows.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			cursor = (cursor + 1) % rows.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			cursor = cursor <= 0 ? rows.length - 1 : cursor - 1;
		}
	}

	/**
	 * Фокус пішов за межі панелі — пошук закривається. Перевіряємо саме
	 * `relatedTarget`: на телефоні тап по неклікабельному місцю панелі
	 * теж знімає фокус, і без перевірки панель закривалась би сама.
	 */
	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget;
		if (!(next instanceof HTMLElement)) return;
		if (panel?.contains(next)) return;
		open = false;
	}

	/** Наведення на товар — вантажимо його сторінку наперед. */
	function warm(href: string) {
		void preloadData(href);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- Розмиття перекриває всю сторінку, включно з шапкою -->
	<div
		class="fixed inset-0 z-50 bg-background/40 backdrop-blur-xl"
		transition:fade={{ duration: 200 }}
	>
		<!-- Клік повз панель закриває пошук -->
		<button
			type="button"
			class="absolute inset-0 h-full w-full cursor-default"
			aria-label="Закрити пошук"
			onclick={() => (open = false)}
		></button>

		<div
			bind:this={panel}
			onfocusout={onFocusOut}
			class="relative border-b bg-background/95 shadow-sm"
			transition:fly={{ y: -24, duration: 300, easing: cubicOut }}
		>
			<div class="mx-auto max-w-3xl px-4 pt-4 pb-6 sm:px-6 sm:pt-8 sm:pb-10">
				<form onsubmit={submit} role="search">
					<div class="flex items-center gap-3 border-b pb-3 sm:gap-4">
						{#if loading && !fresh}
							<LoaderIcon
								class="size-5 shrink-0 animate-spin text-muted-foreground sm:size-6"
								aria-hidden="true"
							/>
						{:else}
							<SearchIcon
								class="size-5 shrink-0 text-muted-foreground sm:size-6"
								aria-hidden="true"
							/>
						{/if}

						<input
							bind:this={input}
							bind:value={query}
							type="text"
							name="q"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
							enterkeyhint="search"
							placeholder="Сукня, куртка…"
							aria-label="Пошук товарів"
							role="combobox"
							aria-expanded={rows.length > 0}
							aria-controls="search-results"
							aria-activedescendant={cursor >= 0 ? `search-row-${cursor}` : undefined}
							class="w-full min-w-0 bg-transparent font-heading text-xl outline-none placeholder:text-muted-foreground/60 sm:text-2xl md:text-3xl"
						/>

						{#if term}
							<button
								type="button"
								onclick={() => {
									query = '';
									input?.focus();
								}}
								class="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								aria-label="Очистити"
							>
								<XIcon class="size-4" />
							</button>
						{/if}

						<!--
							Окрема кнопка закриття. Без неї на телефоні незрозуміло,
							як вийти: тапати «мимо» здогадується не кожен.
						-->
						<button
							type="button"
							onclick={() => (open = false)}
							class="-mr-1 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							aria-label="Закрити пошук"
						>
							<XIcon class="size-5 sm:hidden" />
							<span class="hidden text-xs tracking-[0.12em] uppercase sm:inline">Esc</span>
						</button>
					</div>
				</form>

				<div class="mt-5">
					{#if short}
						{#if recent.length}
							<div class="flex items-center justify-between gap-4">
								<p class="text-xs tracking-[0.12em] text-muted-foreground uppercase">
									Ви вже шукали
								</p>
								<button
									type="button"
									onclick={forgetAll}
									class="text-xs text-muted-foreground underline-offset-4 hover:underline"
								>
									Очистити
								</button>
							</div>
							<ul class="mt-3 mb-6 flex flex-wrap gap-2">
								{#each recent as item (item)}
									<li>
										<button
											type="button"
											onclick={() => {
												query = item;
												input?.focus();
											}}
											class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
										>
											<ClockIcon class="size-3.5 text-muted-foreground" aria-hidden="true" />
											{item}
										</button>
									</li>
								{/each}
							</ul>
						{/if}

						<p class="text-xs tracking-[0.12em] text-muted-foreground uppercase">Популярне</p>
						<ul class="mt-3 flex flex-wrap gap-2">
							{#each quickLinks as link (link.href)}
								<li>
									<a
										href={link.href}
										class="inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
									>
										{link.label}
									</a>
								</li>
							{/each}
						</ul>
					{:else if failed}
						<p class="py-4 text-sm text-muted-foreground">
							Пошук не відповів.
							<a href="/catalog?q={encodeURIComponent(term)}" class="underline underline-offset-4">
								Спробувати на сторінці каталогу
							</a>
						</p>
					{:else if empty}
						<p class="text-sm">Нічого не знайшли за запитом «{term}».</p>
						<p class="mt-1 text-sm text-muted-foreground">
							Спробуйте коротше — назву речі або колір.
						</p>
						<ul class="mt-4 flex flex-wrap gap-2">
							{#each quickLinks as link (link.href)}
								<li>
									<a
										href={link.href}
										class="inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
									>
										{link.label}
									</a>
								</li>
							{/each}
						</ul>
					{:else}
						<!--
							Поки відповідь у дорозі, лишається попередня видача —
							приглушена. Так список не блимає порожнечею на кожній
							літері й не стрибає під пальцем.
						-->
						<ul
							id="search-results"
							role="listbox"
							aria-label="Знайдені товари"
							class={cn('space-y-1 transition-opacity', !fresh && 'opacity-50')}
						>
							{#each results as product, position (product.id)}
								<li>
									<a
										href="/product/{product.slug}"
										id="search-row-{position}"
										role="option"
										aria-selected={cursor === position}
										onmouseenter={() => {
											cursor = position;
											warm(`/product/${product.slug}`);
										}}
										onclick={() => term && remember(term)}
										class={cn(
											'flex items-center gap-3 rounded-xl p-2 transition-colors',
											cursor === position ? 'bg-accent' : 'hover:bg-accent/60'
										)}
									>
										<div class="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
											{#if product.image}
												<!--
													Та сама ширина, що в картках каталогу: кадр уже
													лежить у кеші браузера з попередніх сторінок, тож
													підказка малюється без жодного завантаження. І без
													`lazy`: ці шість фото видно одразу, чекати нічого.
												-->
												<img
													src={imageSrc(product.image.url, IMAGE_SMALL)}
													alt=""
													decoding="async"
													class="size-full object-cover"
												/>
											{/if}
										</div>

										<div class="min-w-0 flex-1">
											<p class="truncate text-sm">{product.name}</p>
											<p class="mt-0.5 flex items-baseline gap-2">
												<span class="text-sm font-medium">{formatPrice(product.price)}</span>
												{#if product.compareAt}
													<span class="text-xs text-muted-foreground line-through">
														{formatPrice(product.compareAt)}
													</span>
												{/if}
											</p>
										</div>

										<ArrowRightIcon
											class="size-4 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
									</a>
								</li>
							{/each}

							{#if rows.length}
								{@const position = rows.length - 1}
								<li>
									<a
										href="/catalog?q={encodeURIComponent(term)}"
										id="search-row-{position}"
										role="option"
										aria-selected={cursor === position}
										onmouseenter={() => (cursor = position)}
										onclick={() => remember(term)}
										class={cn(
											'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
											cursor === position ? 'bg-accent' : 'hover:bg-accent/60'
										)}
									>
										<SearchIcon class="size-4 text-muted-foreground" aria-hidden="true" />
										{#if total > results.length}
											Показати всі {total} {plural(total, 'результат', 'результати', 'результатів')}
										{:else}
											Шукати «{term}» у каталозі
										{/if}
									</a>
								</li>
							{/if}
						</ul>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
