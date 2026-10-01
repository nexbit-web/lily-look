<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import AddedToCartSheet from '$lib/components/product/added-to-cart-sheet.svelte';
	import { BUY_BUTTON, SECONDARY_BUTTON } from '$lib/components/product/buy-button';
	import CarrierMarks from '$lib/components/product/carrier-marks.svelte';
	import PrizeOffer from '$lib/components/product/prize-offer.svelte';
	import QuickOrderDialog from '$lib/components/product/quick-order-dialog.svelte';
	import SizeChartDialog from '$lib/components/product/size-chart-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { FREE_DELIVERY_FROM, RETURN_DAYS, SIZE_ORDER } from '$lib/config';
	import { discountPercent, formatAmount, formatPercent, formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { ActivePrize, DeliveryOption, ProductDetail } from '$lib/types';
	import { cn } from '$lib/utils';
	import { prizeDiscount } from '$lib/wheel';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import TagIcon from '@lucide/svelte/icons/tag';
	import TruckIcon from '@lucide/svelte/icons/truck';
	import WalletIcon from '@lucide/svelte/icons/wallet';
	import { untrack } from 'svelte';
	import toast from 'svelte-hot-french-toast';

	let {
		product,
		/** Способи доставки з порахованою датою отримання — рахує сервер. */
		delivery = [],
		/** Галерея показує фото обраного кольору, тож про вибір треба сказати. */
		onColorChange
	}: {
		product: ProductDetail;
		delivery?: DeliveryOption[];
		onColorChange?: (color: string) => void;
	} = $props();

	/** Нижче цієї межі показуємо, скільки лишилось — це підштовхує до рішення. */
	const LOW_STOCK = 3;

	/**
	 * Порядок розмірів і кольорів задає менеджер у CRM — він лежить у
	 * `variant.position`. Взяти його напряму не вийде: варіант — це пара
	 * «колір + розмір», а списки на сторінці окремі.
	 *
	 * Ускладнює те, що CRM нумерує варіанти суцільним рядом, і з нього не
	 * видно, що йде зовнішнім циклом — кольори чи розміри. Тому кольорам
	 * беремо найменшу позицію (вона вірна за будь-якої нумерації), а
	 * розмірам — не позицію, а місце всередині свого кольору: і при
	 * «Чорний XS, S, M → Білий XS, S, M», і при «XS чорний, XS білий → S…»
	 * воно виходить однакове.
	 *
	 * Шкала розмірів і абетка лишились запасним ключем — на випадок, коли
	 * порядок у CRM ще не проставили: колонка створена з DEFAULT 0, і тоді
	 * позиції нульові у всіх.
	 */
	function rank(size: string): number {
		const index = (SIZE_ORDER as readonly string[]).indexOf(size);
		// Те, чого немає в шкалі («One size», числові 38–54), — у хвіст.
		return index === -1 ? SIZE_ORDER.length : index;
	}

	function bySize(a: string, b: string): number {
		return rank(a) - rank(b) || a.localeCompare(b, 'uk', { numeric: true });
	}

	// Звичайні об'єкти, а не SvelteMap: це проміжні підрахунки всередині
	// $derived, реактивність їм не потрібна.
	const byColor = $derived.by(() => {
		const groups: Record<string, ProductDetail['variants']> = {};
		for (const variant of product.variants) {
			(groups[variant.color] ??= []).push(variant);
		}
		return groups;
	});

	const colors = $derived.by(() => {
		const lowest: Record<string, number> = {};
		const hex: Record<string, string | null> = {};

		for (const [color, variants] of Object.entries(byColor)) {
			lowest[color] = Math.min(...variants.map((variant) => variant.position));
			hex[color] = variants.find((variant) => variant.colorHex)?.colorHex ?? null;
		}

		return Object.keys(lowest)
			.sort((a, b) => lowest[a] - lowest[b] || a.localeCompare(b, 'uk'))
			.map((name) => ({ name, hex: hex[name] }));
	});

	const sizes = $derived.by(() => {
		const place: Record<string, number> = {};

		for (const variants of Object.values(byColor)) {
			[...variants]
				.sort((a, b) => a.position - b.position || bySize(a.size, b.size))
				.forEach((variant, index) => {
					if (place[variant.size] === undefined || index < place[variant.size]) {
						place[variant.size] = index;
					}
				});
		}

		return Object.keys(place).sort((a, b) => place[a] - place[b] || bySize(a, b));
	});

	// Початковий колір беремо один раз: подальші зміни `product` означають
	// перехід на інший товар, а там компонент перемонтовується через {#key}.
	let selectedColor = $state(untrack(() => product.variants[0]?.color ?? ''));
	let selectedSize = $state('');
	let submitting = $state(false);

	const variantFor = (color: string, size: string) =>
		product.variants.find((variant) => variant.color === color && variant.size === size);

	const selected = $derived(variantFor(selectedColor, selectedSize));
	const price = $derived(selected?.price ?? product.price);
	const discount = $derived(discountPercent(price, product.compareAt));
	const onSale = $derived(product.compareAt !== null && product.compareAt > price);

	/**
	 * Приз із колеса. Ціна на сторінці — вже з ним: саме стільки покупець
	 * заплатить, бо та сама знижка (`prizeDiscount`) ляже в замовлення.
	 */
	const prize = $derived((page.data.prize as ActivePrize | null | undefined) ?? null);
	const prizeOff = $derived(prizeDiscount(prize, price));
	const payPrice = $derived(price - prizeOff);
	/** Закреслена ціна: до знижки магазину, а якщо її немає — до приза. */
	const struckPrice = $derived(
		onSale && product.compareAt ? product.compareAt : prizeOff > 0 ? price : null
	);
	const soldOut = $derived(product.variants.every((variant) => variant.stock < 1));

	function chooseColor(color: string) {
		selectedColor = color;
		// Розмір міг бути доступний в іншому кольорі, але не в цьому.
		if (selectedSize && !variantFor(color, selectedSize)?.stock) selectedSize = '';
	}

	// Про колір повідомляємо й одразу після монтування: галерея має знати,
	// з чого починати, а не лише що змінилось.
	$effect(() => {
		onColorChange?.(selectedColor);
	});

	/**
	 * Заміри розміру одним рядком: «UA 44 · Груди 96 см · Рукав 61 см».
	 * Те саме, що в таблиці розмірів, — заміри самої речі з CRM. Чого CRM не
	 * вказала, того в рядку немає; немає нічого — підказки теж.
	 */
	function measuresOf(size: string): string | null {
		const row = product.measurements.find((item) => item.size === size);
		if (!row) return null;
		const parts = [
			row.ua ? `UA ${row.ua}` : null,
			row.chest !== null ? `Груди ${row.chest} см` : null,
			row.sleeve !== null ? `Рукав ${row.sleeve} см` : null,
			row.length !== null ? `Довжина ${row.length} см` : null
		].filter(Boolean);
		return parts.length ? parts.join(' · ') : null;
	}

	const selectedMeasures = $derived(selected ? measuresOf(selected.size) : null);

	/**
	 * Підказка із замірами стоїть по центру над розміром, і в крайнього
	 * розміру вилазила за край вікна — сторінка ставала ширшою, знизу
	 * зʼявлялась смуга прокрутки. Щойно підказка показалась, зсуваємо її
	 * всередину екрана (`--shift`), а стрілку — назад, щоб та й далі
	 * вказувала на свій розмір. Міряємо до відмальовки кадру, тож стрибка
	 * не видно.
	 */
	function placeTip(event: Event) {
		const tip = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[role="tooltip"]');
		if (!tip) return;
		tip.style.setProperty('--shift', '0px');
		const box = tip.getBoundingClientRect();
		if (!box.width) return;

		const EDGE = 12;
		const right = document.documentElement.clientWidth - EDGE;
		let shift = 0;
		if (box.right > right) shift = right - box.right;
		if (box.left + shift < EDGE) shift = EDGE - box.left;
		tip.style.setProperty('--shift', `${shift}px`);
	}

	/** Вікно «Купити в 1 клік». */
	let quickOpen = $state(false);

	/**
	 * Вікно «Додано в кошик». Розмір запамʼятовуємо в момент надсилання:
	 * поки летить запит, покупець може вже тицьнути інший.
	 */
	let addedOpen = $state(false);
	let added = $state<{ size: string; color: string } | undefined>();
	let addedCart = $state<{ count: number; subtotal: number } | null>(null);
	/** Натиснули «купити», не обравши розмір, — підсвічуємо, чого бракує. */
	let askedForSize = $state(false);

	/** Фото обраного кольору — для вікна швидкого замовлення. */
	const photo = $derived(
		(
			product.images.find((image) => image.color === selectedColor) ??
			product.images.find((image) => image.color === null) ??
			product.images[0]
		)?.url ?? null
	);

	/**
	 * Головна дія сторінки. Кнопка активна завжди, поки є що купити: сіра
	 * «Оберіть розмір» читалась як «тут нічого не натиснеш». Без розміру вона
	 * веде до вибору, з розміром — відкриває швидке замовлення.
	 */
	function buyNow() {
		if (!selected) {
			askedForSize = true;
			jumpToSizes();
			return;
		}
		quickOpen = true;
	}

	/** «У кошик» без розміру — так само до вибору, а не відмова від сервера. */
	function guardCart(event: MouseEvent) {
		if (selected) return;
		event.preventDefault();
		askedForSize = true;
		jumpToSizes();
	}

	// Найпопулярніший спосіб доставки — його дату й ціну показуємо в панелі,
	// решта способів лишається в розділі «Доставка й оплата» нижче.
	const shipping = $derived(delivery.find((option) => option.value === 'NOVA_POSHTA_BRANCH'));

	/**
	 * Три відповіді на питання, через які кидають кошик: коли прийде,
	 * коли платити і що буде, якщо не підійде. Заголовок — суть, рядок
	 * під ним — деталь, за якою вже не треба нікуди йти.
	 *
	 * Ціни доставки тут немає свідомо: її рахує перевізник за своїм
	 * тарифом, і точну суму покупець побачить при оформленні.
	 */
	const assurances = $derived([
		{
			icon: TruckIcon,
			title: shipping ? `Отримаєте ${shipping.eta}` : 'Доставка по всій Україні',
			text: `Вартість за тарифами перевізника · від ${formatPrice(FREE_DELIVERY_FROM)} — безкоштовно`,
			href: '/delivery',
			carriers: true
		},
		{
			icon: WalletIcon,
			title: 'Оплата при отриманні',
			text: 'Спершу приміряєте на пошті, потім платите · без передоплати',
			href: null,
			carriers: false
		},
		{
			icon: RotateCcwIcon,
			title: `Повернення протягом ${RETURN_DAYS} ${plural(RETURN_DAYS, 'дня', 'днів', 'днів')}`,
			text: 'Не підійшов розмір — обміняємо або повернемо гроші',
			href: '/returns',
			carriers: false
		}
	]);

	let ctaBox = $state<HTMLElement | null>(null);
	let sizesBox = $state<HTMLElement | null>(null);
	let ctaOnScreen = $state(true);

	/**
	 * На телефоні кнопка їде вгору разом із фото, і покупець гортає опис
	 * без жодного способу купити. Щойно вона зникла з екрана — знизу
	 * зʼявляється та сама кнопка панеллю.
	 */
	$effect(() => {
		if (!ctaBox) return;

		const observer = new IntersectionObserver(([entry]) => (ctaOnScreen = entry.isIntersecting), {
			threshold: 0
		});
		observer.observe(ctaBox);

		return () => observer.disconnect();
	});

	const barOpen = $derived(!ctaOnScreen && !soldOut && sizes.length > 0);

	/** Без обраного розміру купити нічого — ведемо до вибору, а не в глухий кут. */
	function jumpToSizes() {
		sizesBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		sizesBox?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
	}
</script>

<div class="space-y-6">
	<div>
		<a
			href="/catalog/{product.category.slug}"
			class="text-xs tracking-[0.15em] text-muted-foreground uppercase hover:text-foreground"
		>
			{product.category.name}
		</a>

		<!-- Назва — шрифтом логотипа: так сторінка товару звучить як бренд,
		     а не як картка маркетплейсу. text-balance не лишає одне слово
		     самотнім на другому рядку. -->
		<h1
			class="mt-3 font-heading text-[1.75rem] leading-[1.15] font-normal tracking-tight text-balance md:text-[2.5rem]"
		>
			{product.name}
		</h1>

		<!-- Ціна. Сума — велика й жирна, «грн» дрібніше: око хапає число.
		     Зі знижкою нова ціна червона, стара — закреслена поруч, а відсоток
		     і вигода в гривнях зібрані в одну плашку під ними. Є приз із
		     колеса — замість плашки розклад: звідки ця ціна й скільки
		     економите. -->
		<div data-slot="price" class="mt-5">
			<p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span
					class={cn(
						'text-[2rem] leading-none font-semibold tracking-tight tabular-nums',
						(onSale || prizeOff > 0) && 'text-sale'
					)}
				>
					{formatAmount(payPrice)}<span class="ml-1 text-lg font-medium">грн</span>
				</span>
				{#if struckPrice}
					<span class="text-lg text-muted-foreground tabular-nums line-through">
						{formatPrice(struckPrice)}
					</span>
				{/if}
			</p>

			{#if prize}
				<PrizeOffer {prize} {price} compareAt={product.compareAt} />
			{:else if onSale && product.compareAt}
				<p
					data-slot="sale-badge"
					class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sale/10 px-3 py-1 text-xs font-medium text-sale"
				>
					<TagIcon class="size-3.5" aria-hidden="true" />
					{#if discount}
						<span class="font-semibold">−{formatPercent(discount)}%</span>
						<span aria-hidden="true">·</span>
					{/if}
					Економія {formatPrice(product.compareAt - price)}
				</p>
			{/if}
		</div>
	</div>

	<form
		method="POST"
		action="?/add"
		class="space-y-5 border-t pt-6"
		use:enhance={() => {
			submitting = true;
			const sent = selected;
			return async ({ result }) => {
				submitting = false;

				if (result.type === 'success') {
					added = sent;
					addedCart = (result.data?.cart as typeof addedCart) ?? null;
					addedOpen = true;
					// Оновлюємо лічильник у шапці, не перезавантажуючи сторінку.
					await invalidateAll();
					return;
				}
				if (result.type === 'failure') {
					toast.error(String(result.data?.message ?? 'Не вдалося додати товар'));
					return;
				}
				toast.error('Щось пішло не так. Спробуйте ще раз.');
			};
		}}
	>
		<input type="hidden" name="variantId" value={selected?.id ?? ''} />

		{#if colors.length > 1}
			<fieldset class="space-y-3">
				<legend class="text-xs tracking-[0.15em] uppercase">
					Колір: <span class="text-muted-foreground">{selectedColor}</span>
				</legend>
				<div data-slot="color-options" class="flex flex-wrap gap-2.5">
					{#each colors as color (color.name)}
						{@const active = selectedColor === color.name}
						<button
							type="button"
							onclick={() => chooseColor(color.name)}
							aria-pressed={active}
							title={color.name}
							class={cn(
								'flex size-9 cursor-pointer items-center justify-center rounded-full ring-1 ring-foreground/15 transition-all',
								active && 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
							)}
							style={color.hex ? `background-color: ${color.hex}` : undefined}
						>
							{#if active}
								<CheckIcon class="size-3.5 text-white mix-blend-difference" />
							{/if}
							<span class="sr-only">{color.name}</span>
						</button>
					{/each}
				</div>
			</fieldset>
		{/if}

		<!-- Від розмірів до кнопки — впритул: «Залишилось 1 шт.» стоїть посередині,
		     і кнопка читається як продовження вибору, а не окремий блок. -->
		<fieldset class="mb-3! space-y-3">
			<div class="flex items-center justify-between gap-4">
				<legend class="text-xs tracking-[0.15em] uppercase">Розмір</legend>
				{#if product.measurements.length}
					<SizeChartDialog measurements={product.measurements} {selectedSize} />
				{/if}
			</div>

			<div bind:this={sizesBox}>
				{#if sizes.length === 0}
					<!-- Розміри без залишку сюди не доїжджають узагалі, тож порожній
					     список означає рівно одне: модель розібрали. -->
					<p class="text-sm text-muted-foreground">
						Усі розміри розібрали. Модель повернеться в наявність — з'явиться й вибір.
					</p>
				{:else}
					<!-- Розміри «таблетками»: однакова мінімальна ширина тримає ряд
					     рівним, а довгий розмір («S/M», «4XL») просто ширшає. -->
					<div data-slot="size-options" class="flex flex-wrap gap-2.5">
						{#each sizes as size, index (size)}
							{@const variant = variantFor(selectedColor, size)}
							{@const available = (variant?.stock ?? 0) > 0}
							{@const measures = measuresOf(size)}
							<div
								class="group/size relative"
								role="presentation"
								onmouseenter={placeTip}
								onfocusin={placeTip}
							>
								<button
									type="button"
									disabled={!available}
									onclick={() => (selectedSize = size)}
									aria-pressed={selectedSize === size}
									aria-describedby={measures ? `size-tip-${index}` : undefined}
									class={cn(
										'h-10 min-w-16 cursor-pointer rounded-full border px-5 text-base transition-colors',
										selectedSize === size
											? 'border-foreground ring-1 ring-foreground'
											: 'border-foreground/25 hover:border-foreground/60',
										!available &&
											'cursor-not-allowed border-dashed text-muted-foreground/60 line-through hover:border-foreground/25'
									)}
								>
									{size}
								</button>

								<!-- Заміри над розміром — під курсором або з клавіатури. На
								     дотиковому екрані наводити нічим: там заміри обраного
								     розміру стоять рядком під кнопками.
								     Схована підказка — `hidden`, а не прозора: прозора все одно
								     займала місце й у крайнього розміру вилазила за край екрана
								     телефона — сторінка ставала ширшою й їхала вбік. -->
								{#if measures}
									<span
										id="size-tip-{index}"
										role="tooltip"
										class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2.5 hidden [translate:calc(-50%_+_var(--shift,0px))] rounded-md bg-foreground/90 px-3 py-2 text-sm font-medium whitespace-nowrap text-background shadow-lg transition-[opacity,display] transition-discrete duration-150 group-hover/size:block group-has-focus-visible/size:block starting:opacity-0"
									>
										{measures}
										<span
											class="absolute top-full left-1/2 [translate:calc(-50%_-_var(--shift,0px))] border-[6px] border-transparent border-t-foreground/90"
											aria-hidden="true"
										></span>
									</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Рядок під розмірами тримає висоту завжди: інакше кнопка
			     підстрибувала б щоразу, коли зʼявляється попередження. -->
			<p class="min-h-4 text-xs leading-4 text-brand" aria-live="polite">
				{#if selected && selected.stock <= LOW_STOCK}
					Залишилось {selected.stock} шт. — устигніть
				{:else if askedForSize && !selected}
					Оберіть розмір, щоб замовити
				{:else if selectedMeasures}
					<span class="text-muted-foreground">Заміри {selectedSize}: {selectedMeasures}</span>
				{/if}
			</p>
		</fieldset>

		<div class="space-y-5">
			<div bind:this={ctaBox} class="space-y-3">
				{#if soldOut}
					<Button type="button" size="lg" class={cn(BUY_BUTTON, 'h-14 w-full text-xl')} disabled>
						Немає в наявності
					</Button>
				{:else}
					<Button
						type="button"
						size="lg"
						class={cn(BUY_BUTTON, 'h-14 w-full text-xl')}
						onclick={buyNow}
					>
						Купити в 1 клік
					</Button>
					<Button
						type="submit"
						size="lg"
						class={cn(SECONDARY_BUTTON, 'h-12 w-full text-base')}
						disabled={submitting}
						onclick={guardCart}
					>
						<!-- Поки летить запит, кнопка показує тільки спінер: текст під ним
						     миготів би, а стан «зачекайте» має читатись з одного погляду. -->
						{#if submitting}
							<Spinner class="size-6" aria-label="Додаємо в кошик" />
						{:else}
							Додати в кошик
						{/if}
					</Button>
				{/if}
			</div>

			<!-- Зелені знаки — «тут усе гаразд»; заголовок, що веде на умови, —
			     зі стрілкою, як посилання в застосунках маркетплейсів. -->
			<ul class="space-y-4 border-t pt-5 text-sm">
				{#each assurances as item (item.title)}
					<li class="flex gap-3">
						<item.icon
							class="mt-px size-5 shrink-0 text-[#2f7d0a]"
							strokeWidth={2.25}
							aria-hidden="true"
						/>
						<div class="min-w-0 space-y-1">
							{#if item.href}
								<a
									href={item.href}
									class="group/link inline-flex items-center gap-0.5 font-semibold hover:text-[#2f7d0a]"
								>
									{item.title}
									<ChevronRightIcon
										class="size-4 transition-transform group-hover/link:translate-x-0.5 motion-reduce:transition-none"
										aria-hidden="true"
									/>
								</a>
							{:else}
								<p class="font-semibold">{item.title}</p>
							{/if}
							<p class="text-xs text-muted-foreground">{item.text}</p>
							{#if item.carriers}
								<CarrierMarks />
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>

		<!--
			Панель знизу на телефоні. Саме {#if}, а не прихований блок: інакше
			її кнопка лишалась би у фокусі й у скрінрідері за краєм екрана.
			Кнопка всередині тієї ж форми, тож надсилає той самий варіант.
		-->
		{#if barOpen}
			<div
				data-slot="buy-bar"
				class="fixed inset-x-0 bottom-0 z-30 animate-in border-t bg-background/95 backdrop-blur duration-300 slide-in-from-bottom motion-reduce:animate-none lg:hidden"
			>
				<!-- Нижній відступ рахує смугу жестів на iPhone: без цього кнопка
				     ліпиться до самого краю й натискається через раз. -->
				<div
					class="mx-auto flex max-w-6xl items-center gap-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
				>
					<div class="min-w-0 flex-1">
						<p class="truncate text-xs text-muted-foreground">{product.name}</p>
						<p class="tabular-nums">
							<span class={cn(prizeOff > 0 && 'font-medium text-sale')}>
								{formatPrice(payPrice)}
							</span>
							{#if prizeOff > 0}
								<span class="ml-1 text-xs text-muted-foreground line-through">
									{formatPrice(price)}
								</span>
							{/if}
						</p>
					</div>

					{#if selected}
						<Button type="button" onclick={buyNow} class={cn(BUY_BUTTON, 'h-12 shrink-0 px-6')}>
							Купити в 1 клік
						</Button>
					{:else}
						<Button
							type="button"
							onclick={jumpToSizes}
							class={cn(BUY_BUTTON, 'h-12 shrink-0 px-6')}
						>
							Обрати розмір
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</form>

	<AddedToCartSheet
		bind:open={addedOpen}
		name={product.name}
		variant={added}
		{price}
		image={photo}
		cart={addedCart}
	/>

	<!-- Окрема форма, не всередині форми кошика: у неї свій action і свої поля. -->
	<QuickOrderDialog
		bind:open={quickOpen}
		name={product.name}
		variant={selected}
		{price}
		image={photo}
	/>
</div>
