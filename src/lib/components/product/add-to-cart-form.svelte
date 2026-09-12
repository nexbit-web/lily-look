<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import SizeChartDialog from '$lib/components/product/size-chart-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { RETURN_DAYS, SIZE_ORDER } from '$lib/config';
	import { discountPercent, formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { DeliveryOption, ProductDetail } from '$lib/types';
	import { cn } from '$lib/utils';
	import CheckIcon from '@lucide/svelte/icons/check';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
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

	// Унікальні кольори в порядку появи — варіантів на товар одиниці,
	// тож findIndex дешевший за додаткову структуру даних.
	const colors = $derived(
		product.variants
			.filter(
				(variant, index) =>
					product.variants.findIndex((other) => other.color === variant.color) === index
			)
			.map((variant) => ({ name: variant.color, hex: variant.colorHex }))
	);

	const sizes = $derived.by(() => {
		const order = SIZE_ORDER as readonly string[];
		return [...new Set(product.variants.map((variant) => variant.size))].sort(
			(a, b) => order.indexOf(a) - order.indexOf(b)
		);
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

	function label() {
		if (soldOut) return 'Немає в наявності';
		if (!selected) return 'Оберіть розмір';
		return 'Додати в кошик';
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
			text: 'Нова Пошта або Укрпошта · вартість за тарифами перевізника'
		},
		{
			icon: WalletIcon,
			title: 'Оплата при отриманні',
			text: 'Спершу приміряєте на пошті, потім платите'
		},
		{
			icon: RotateCcwIcon,
			title: `Повернення протягом ${RETURN_DAYS} ${plural(RETURN_DAYS, 'дня', 'днів', 'днів')}`,
			text: 'Не підійшов розмір — заберемо назад'
		}
	]);

	/**
	 * Заливка кнопки — фонова картинка з background-position: center.
	 * На наведення її ширина йде в нуль, тож колір стискається з обох
	 * боків до середини, лишаючи рамку й текст того ж кольору.
	 * `enabled:` — щоб вимкнена кнопка не «роздягалась» під курсором.
	 */
	const BUY_BUTTON =
		'rounded-md border-2 border-[#53af01] bg-transparent bg-[linear-gradient(#53af01,#53af01)] bg-[length:100%_100%] bg-center bg-no-repeat duration-500 hover:bg-transparent enabled:hover:bg-[length:0%_100%] enabled:hover:text-[#53af01]';

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

<div class="space-y-8">
	<div>
		<a
			href="/catalog/{product.category.slug}"
			class="text-xs tracking-[0.15em] text-muted-foreground uppercase hover:text-foreground"
		>
			{product.category.name}
		</a>

		<h1 class="mt-3 text-3xl font-medium tracking-tight md:text-4xl">{product.name}</h1>

		<div class="mt-4 flex flex-wrap items-baseline gap-3">
			<span class="text-3xl tabular-nums">{formatPrice(price)}</span>
			{#if product.compareAt && product.compareAt > price}
				<span class="text-muted-foreground tabular-nums line-through">
					{formatPrice(product.compareAt)}
				</span>
				<span
					class="rounded-full px-2 py-0.5 text-xs font-semibold text-sale ring-1 ring-sale/30 ring-inset"
				>
					−{discount}%
				</span>
			{/if}
		</div>

		<!-- Вигода словами: відсоток покупець ще має перекласти в гривні,
		     а різницю бачить одразу. -->
		{#if product.compareAt && product.compareAt > price}
			<p class="mt-2 text-sm text-sale">
				Ви заощаджуєте {formatPrice(product.compareAt - price)}
			</p>
		{/if}
	</div>

	<form
		method="POST"
		action="?/add"
		class="space-y-7"
		use:enhance={() => {
			submitting = true;
			return async ({ result }) => {
				submitting = false;

				if (result.type === 'success') {
					toast.success('Додано в кошик');
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
				<div class="flex flex-wrap gap-2.5">
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

		<fieldset class="space-y-3">
			<div class="flex items-center justify-between gap-4">
				<legend class="text-xs tracking-[0.15em] uppercase">Розмір</legend>
				<SizeChartDialog categorySlug={product.category.slug} {selectedSize} />
			</div>

			<div bind:this={sizesBox}>
				{#if sizes.length === 0}
					<!-- Розміри без залишку сюди не доїжджають узагалі, тож порожній
					     список означає рівно одне: модель розібрали. -->
					<p class="text-sm text-muted-foreground">
						Усі розміри розібрали. Модель повернеться в наявність — з'явиться й вибір.
					</p>
				{:else}
					<!-- Сітка, а не flex-wrap: кнопки однакової ширини читаються
					     як один блок, а не як розсипаний набір. -->
					<div class="grid grid-cols-4 gap-2 sm:grid-cols-5">
						{#each sizes as size (size)}
							{@const variant = variantFor(selectedColor, size)}
							{@const available = (variant?.stock ?? 0) > 0}
							<button
								type="button"
								disabled={!available}
								onclick={() => (selectedSize = size)}
								aria-pressed={selectedSize === size}
								class={cn(
									'h-10 cursor-pointer rounded-md border text-sm transition-colors',
									selectedSize === size
										? 'border-foreground bg-foreground text-background'
										: 'hover:border-foreground/40',
									!available &&
										'cursor-not-allowed border-dashed text-muted-foreground/60 line-through hover:border-border'
								)}
							>
								{size}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Рядок під розмірами тримає висоту завжди: інакше кнопка
			     підстрибувала б щоразу, коли зʼявляється попередження. -->
			<p class="min-h-5 text-xs text-brand">
				{#if selected && selected.stock <= LOW_STOCK}
					Залишилось {selected.stock} шт. — устигніть
				{/if}
			</p>
		</fieldset>

		<div class="space-y-5">
			<div bind:this={ctaBox}>
				<Button
					type="submit"
					size="lg"
					class={cn(BUY_BUTTON, 'h-14 w-full text-xl')}
					disabled={!selected || submitting || soldOut}
				>
					<!-- Поки летить запит, кнопка показує тільки спінер: текст під ним
					     миготів би, а стан «зачекайте» має читатись з одного погляду. -->
					{#if submitting}
						<Spinner class="size-7" aria-label="Додаємо в кошик" />
					{:else}
						{label()}
					{/if}
				</Button>
			</div>

			<ul class="space-y-4 text-sm">
				{#each assurances as item (item.title)}
					<li class="flex gap-3">
						<item.icon class="mt-0.5 size-4.5 shrink-0 text-foreground/40" aria-hidden="true" />
						<span>
							<span class="block">{item.title}</span>
							<span class="block text-xs text-muted-foreground">{item.text}</span>
						</span>
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
						<p class="tabular-nums">{formatPrice(price)}</p>
					</div>

					{#if selected}
						<Button
							type="submit"
							class={cn(BUY_BUTTON, 'h-12 shrink-0 px-6')}
							disabled={submitting}
						>
							{#if submitting}
								<Spinner class="size-6" aria-label="Додаємо в кошик" />
							{:else}
								Додати в кошик
							{/if}
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
</div>
