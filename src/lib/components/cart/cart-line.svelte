<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatPrice } from '$lib/money';
	import type { CartLine } from '$lib/types';
	import { cn } from '$lib/utils';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import type { SubmitFunction } from '@sveltejs/kit';
	import toast from 'svelte-hot-french-toast';

	let {
		line,
		removing = false,
		onQuantity,
		onRemove,
		onSettled
	}: {
		/** Кількість тут уже оптимістична — сторінка змержила її до рендера. */
		line: CartLine;
		/** Позицію видаляють: рядок гасне, але лишається до відповіді сервера. */
		removing?: boolean;
		onQuantity: (quantity: number) => void;
		onRemove: () => void;
		onSettled: () => void;
	} = $props();

	/**
	 * Кожна дія — окрема form action, тож кошик працює і без JavaScript.
	 * З JS ми перехоплюємо клік: число змінюється миттєво, а серія кліків
	 * по «+» складається в один запит замість запиту на кожен крок.
	 */
	const COMMIT_DELAY_MS = 400;

	let quantityForm = $state<HTMLFormElement | null>(null);
	let commitButton = $state<HTMLButtonElement | null>(null);
	let pending = $state<'minus' | 'plus' | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Лічильник намірів. Якщо користувач клікнув ще раз, поки летів запит,
	 * відповідь на попередній не має скидати оптимістичну кількість —
	 * інакше число стрибне назад, а останній клік загубиться.
	 */
	let revision = $state(0);

	let image = $state<HTMLImageElement | null>(null);
	let imageReady = $state(false);

	// Картинка з кешу встигає завантажитись до гідратації — onload уже не буде.
	$effect(() => {
		if (image?.complete) imageReady = true;
	});

	// Пішли зі сторінки з незавершеним таймером — нічого не відправляємо.
	$effect(() => () => clearTimeout(timer));

	function step(delta: -1 | 1) {
		return (event: MouseEvent) => {
			// Без JS обробник не спрацює і форма піде звичайним POST — тому
			// кнопки лишаються submit'ами з власним value.
			event.preventDefault();

			const next = line.quantity + delta;
			if (next < 1 || next > line.stock) return;

			pending = delta === 1 ? 'plus' : 'minus';
			revision += 1;
			onQuantity(next);

			clearTimeout(timer);
			timer = setTimeout(() => quantityForm?.requestSubmit(commitButton), COMMIT_DELAY_MS);
		};
	}

	const saveQuantity: SubmitFunction = () => {
		const submitted = revision;

		return async ({ result, update }) => {
			if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'Не вдалося оновити кошик'));
			}
			// update() перезапускає load — свіжі дані приходять до скидання
			// оптимістичної кількості, тож число не встигає стрибнути назад.
			await update();

			// Поки летів запит, користувач клікнув ще раз — чекаємо на нього.
			if (submitted !== revision) return;

			pending = null;
			onSettled();
		};
	};

	const removeLine: SubmitFunction = () => {
		// Відкладена зміна кількості вже не має сенсу — позиції не буде.
		clearTimeout(timer);
		onRemove();
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'Не вдалося видалити позицію'));
			} else {
				toast.success('Видалено з кошика');
			}
			await update();
			onSettled();
		};
	};
</script>

<li
	class={cn('flex gap-4 py-6 transition-opacity', removing && 'pointer-events-none opacity-40')}
	aria-busy={removing}
>
	<a
		href="/product/{line.productSlug}"
		class="relative size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-28"
	>
		{#if line.imageUrl}
			{#if !imageReady}
				<Skeleton class="absolute inset-0 size-full rounded-xl" />
			{/if}
			<img
				bind:this={image}
				src={line.imageUrl}
				alt={line.productName}
				loading="lazy"
				decoding="async"
				onload={() => (imageReady = true)}
				class={cn(
					'size-full object-cover transition-opacity duration-300',
					imageReady ? 'opacity-100' : 'opacity-0'
				)}
			/>
		{/if}
	</a>

	<div class="flex flex-1 flex-col gap-3">
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<a href="/product/{line.productSlug}" class="text-sm hover:underline">{line.productName}</a>
				<p class="mt-1 text-xs text-muted-foreground">
					{line.color} · розмір {line.size}
				</p>
			</div>

			<div class="text-right">
				<p class="text-sm font-medium whitespace-nowrap tabular-nums">
					{formatPrice(line.lineTotal)}
				</p>
				{#if line.quantity > 1}
					<p class="mt-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
						{line.quantity} × {formatPrice(line.unitPrice)}
					</p>
				{/if}
			</div>
		</div>

		<div class="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
			<div class="flex items-center gap-3">
				<form
					bind:this={quantityForm}
					method="POST"
					action="?/update"
					use:enhance={saveQuantity}
					class="flex items-center gap-1"
				>
					<input type="hidden" name="itemId" value={line.id} />

					<Button
						type="submit"
						name="quantity"
						value={String(line.quantity - 1)}
						onclick={step(-1)}
						variant="outline"
						size="icon"
						class="size-8"
						disabled={removing || line.quantity <= 1}
						aria-label="Зменшити кількість"
					>
						{#if pending === 'minus'}
							<Spinner class="size-3.5" />
						{:else}
							<MinusIcon class="size-3.5" />
						{/if}
					</Button>

					<span class="w-9 text-center text-sm tabular-nums" aria-live="polite">
						{line.quantity}
					</span>

					<Button
						type="submit"
						name="quantity"
						value={String(line.quantity + 1)}
						onclick={step(1)}
						variant="outline"
						size="icon"
						class="size-8"
						disabled={removing || line.quantity >= line.stock}
						aria-label="Збільшити кількість"
					>
						{#if pending === 'plus'}
							<Spinner class="size-3.5" />
						{:else}
							<PlusIcon class="size-3.5" />
						{/if}
					</Button>

					<!-- Прихована кнопка: нею відправляємо накопичену кількість -->
					<button
						bind:this={commitButton}
						type="submit"
						name="quantity"
						value={String(line.quantity)}
						class="hidden"
						tabindex="-1"
						aria-hidden="true"
					></button>
				</form>

				{#if line.quantity >= line.stock}
					<span class="text-xs text-muted-foreground">Це весь залишок</span>
				{/if}
			</div>

			<form method="POST" action="?/remove" use:enhance={removeLine}>
				<input type="hidden" name="itemId" value={line.id} />
				<Button
					type="submit"
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-destructive"
					disabled={removing}
				>
					{#if removing}
						<Spinner class="size-3.5" />
					{:else}
						<Trash2Icon class="size-3.5" />
					{/if}
					Видалити
				</Button>
			</form>
		</div>
	</div>
</li>
