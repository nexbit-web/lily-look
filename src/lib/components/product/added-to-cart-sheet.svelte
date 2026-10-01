<script lang="ts">
	import { BUY_BUTTON, SECONDARY_BUTTON } from '$lib/components/product/buy-button';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import { FREE_DELIVERY_FROM } from '$lib/config';
	import { IMAGE_SMALL, imageSrc } from '$lib/image';
	import { formatPrice } from '$lib/money';
	import { plural } from '$lib/plural';
	import { cn } from '$lib/utils';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import TruckIcon from '@lucide/svelte/icons/truck';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Що бачить покупець, щойно поклав річ у кошик.
	 *
	 * Раніше тут був лише тост «Додано в кошик», що зникав за дві секунди.
	 * Статистика показала: з тих, хто додав товар, більшість так і не
	 * відкрила кошик — поверталась у колекцію й ішла з сайту. Наступного
	 * кроку просто не було видно. Тепер він перед очима: велика кнопка
	 * «Оформити замовлення» й поруч — «Продовжити покупки» для тих, хто
	 * ще вибирає.
	 *
	 * На телефоні — панель знизу, під великим пальцем; на компʼютері —
	 * картка в кутку, щоб не закривати всю сторінку.
	 */
	let {
		open = $bindable(false),
		name,
		variant,
		price,
		image,
		cart
	}: {
		open?: boolean;
		name: string;
		variant: { size: string; color: string } | undefined;
		price: number;
		image: string | null;
		/** Кошик після додавання — рахує сервер; немає — рядок про кошик не показуємо. */
		cart: { count: number; subtotal: number } | null;
	} = $props();

	/** Скільки бракує до безкоштовної доставки — найсильніший привід додати ще річ. */
	const missing = $derived(cart ? Math.max(0, FREE_DELIVERY_FROM - cart.subtotal) : null);
	const progress = $derived(
		cart ? Math.min(100, Math.round((cart.subtotal / FREE_DELIVERY_FROM) * 100)) : 0
	);
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		showCloseButton={false}
		data-slot="added-to-cart"
		class="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:right-6! sm:bottom-6! sm:left-auto! sm:w-[26rem] sm:rounded-2xl sm:border"
	>
		<Sheet.Header class="flex-row items-center gap-2.5 border-b px-5 py-4">
			<CircleCheckIcon class="size-6 shrink-0 text-[#2f7d0a]" aria-hidden="true" />
			<Sheet.Title
				class="flex-1 text-left font-sans text-lg font-medium tracking-tight normal-case"
			>
				Додано в кошик
			</Sheet.Title>
			<Sheet.Description class="sr-only">
				Оформіть замовлення або продовжуйте вибирати.
			</Sheet.Description>
			<Sheet.Close
				class="-mr-1 flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<XIcon class="size-5" aria-hidden="true" />
				<span class="sr-only">Закрити</span>
			</Sheet.Close>
		</Sheet.Header>

		<div class="space-y-4 px-5 py-4">
			<div class="flex gap-4">
				<div class="size-20 shrink-0 overflow-hidden rounded-md bg-muted">
					{#if image}
						<img src={imageSrc(image, IMAGE_SMALL)} alt="" class="size-full object-cover" />
					{/if}
				</div>
				<div class="min-w-0 text-sm">
					<p class="line-clamp-2 font-medium">{name}</p>
					{#if variant}
						<p class="mt-0.5 text-muted-foreground">{variant.color} · {variant.size}</p>
					{/if}
					<p class="mt-1 text-base tabular-nums">{formatPrice(price)}</p>
				</div>
			</div>

			{#if cart && missing !== null}
				<div data-slot="cart-summary" class="space-y-2 rounded-lg bg-muted/60 px-4 py-3 text-sm">
					<p>
						У кошику {cart.count}
						{plural(cart.count, 'товар', 'товари', 'товарів')} на
						<span class="font-semibold tabular-nums">{formatPrice(cart.subtotal)}</span>
					</p>
					<p class="flex items-center gap-2 text-xs text-muted-foreground">
						<TruckIcon class="size-4 shrink-0 text-[#2f7d0a]" aria-hidden="true" />
						{#if missing === 0}
							<span class="font-medium text-[#2f7d0a]">Доставка для вас безкоштовна</span>
						{:else}
							<span>
								До безкоштовної доставки — ще
								<span class="font-medium text-foreground tabular-nums">{formatPrice(missing)}</span>
							</span>
						{/if}
					</p>
					<div class="h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
						<div class="h-full rounded-full bg-[#53af01]" style="width: {progress}%"></div>
					</div>
				</div>
			{/if}
		</div>

		<div class="space-y-2.5 px-5 pb-5">
			<Button href="/checkout" size="lg" class={cn(BUY_BUTTON, 'h-12 w-full text-base')}>
				Оформити замовлення
			</Button>
			<Button
				type="button"
				size="lg"
				class={cn(SECONDARY_BUTTON, 'h-12 w-full text-base')}
				onclick={() => (open = false)}
			>
				Продовжити покупки
			</Button>
			<p class="pt-1 text-center text-xs text-muted-foreground">
				Оплата при отриманні · без передоплати
			</p>
		</div>
	</Sheet.Content>
</Sheet.Root>
