<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import Field from '$lib/components/checkout/field.svelte';
	import PhoneField from '$lib/components/checkout/phone-field.svelte';
	import { BUY_BUTTON } from '$lib/components/product/buy-button';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Spinner } from '$lib/components/ui/spinner';
	import { IMAGE_SMALL, imageSrc } from '$lib/image';
	import { formatPrice } from '$lib/money';
	import { cn } from '$lib/utils';
	import PhoneCallIcon from '@lucide/svelte/icons/phone-call';
	import toast from 'svelte-hot-french-toast';

	/**
	 * «Купити в 1 клік»: ім'я й телефон — і замовлення вже в менеджерів.
	 *
	 * Покупець з реклами на телефоні не хоче заповнювати місто, відділення й
	 * пошту заради речі, яку ще не приміряв. Тут два поля, а решту менеджер
	 * уточнює дзвінком — саме так купують в українських магазинах з оплатою
	 * при отриманні. Кошик не чіпається.
	 */
	let {
		open = $bindable(false),
		name,
		variant,
		price,
		image
	}: {
		open?: boolean;
		name: string;
		variant: { id: string; size: string; color: string } | undefined;
		price: number;
		image: string | null;
	} = $props();

	let customerName = $state('');
	let phoneDigits = $state('');
	let sending = $state(false);
	let errors = $state<Record<string, string>>({});
	let message = $state('');

	/** Ті самі правила, що й у сервера й оформлення, — щоб не чекати відповіді на очевидне. */
	function check(): Record<string, string> {
		const result: Record<string, string> = {};
		if (customerName.trim().length < 2) result.customerName = 'Вкажіть ім’я';
		if (!phoneDigits) result.customerPhone = 'Вкажіть номер телефону';
		else if (phoneDigits.length < 10) result.customerPhone = 'Номер має містити 10 цифр';
		else if (!phoneDigits.startsWith('0')) result.customerPhone = 'Номер має починатися з нуля';
		return result;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md">
		<Dialog.Header class="border-b px-6 py-5">
			<Dialog.Title class="font-sans text-lg font-medium tracking-tight normal-case">
				Купити в 1 клік
			</Dialog.Title>
			<Dialog.Description class="text-left text-xs">
				Лише ім’я й телефон — решту менеджер уточнить дзвінком.
			</Dialog.Description>
		</Dialog.Header>

		{#if variant}
			<div class="flex gap-4 border-b px-6 py-4">
				<div class="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
					{#if image}
						<img src={imageSrc(image, IMAGE_SMALL)} alt="" class="size-full object-cover" />
					{/if}
				</div>
				<div class="min-w-0 text-sm">
					<p class="truncate font-medium">{name}</p>
					<p class="text-muted-foreground">{variant.color} · {variant.size}</p>
					<p class="mt-1 tabular-nums">{formatPrice(price)}</p>
				</div>
			</div>
		{/if}

		<form
			method="POST"
			action="?/quick"
			class="space-y-4 px-6 py-5"
			use:enhance={({ cancel }) => {
				const found = check();
				errors = found;
				message = '';
				if (Object.keys(found).length) {
					cancel();
					return;
				}
				sending = true;
				return async ({ result }) => {
					sending = false;
					if (result.type === 'redirect') {
						// Замовлення створене — на його сторінку.
						await applyAction(result);
						return;
					}
					if (result.type === 'failure') {
						errors = (result.data?.errors as Record<string, string>) ?? {};
						message = String(result.data?.message ?? '');
						return;
					}
					toast.error('Щось пішло не так. Спробуйте ще раз або зателефонуйте нам.');
				};
			}}
		>
			<input type="hidden" name="variantId" value={variant?.id ?? ''} />

			<Field id="quickName" label="Ім’я" required error={errors.customerName ?? ''}>
				<input
					class="field-input"
					id="quickName"
					name="customerName"
					placeholder="Олена"
					autocomplete="name"
					aria-invalid={Boolean(errors.customerName)}
					bind:value={customerName}
				/>
			</Field>

			<Field id="quickPhone" label="Телефон" required error={errors.customerPhone ?? ''}>
				<PhoneField
					id="quickPhone"
					invalid={Boolean(errors.customerPhone)}
					bind:digits={phoneDigits}
				/>
			</Field>

			{#if message}
				<p class="text-sm text-destructive" role="alert">{message}</p>
			{/if}

			<Button
				type="submit"
				size="lg"
				class={cn(BUY_BUTTON, 'h-14 w-full text-lg')}
				disabled={sending || !variant}
			>
				{#if sending}
					<Spinner class="size-6" aria-label="Оформлюємо замовлення" />
				{:else}
					Замовити
				{/if}
			</Button>

			<p class="flex gap-2.5 text-xs text-muted-foreground">
				<PhoneCallIcon class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
				<span>
					Менеджер зателефонує, підтвердить розмір і відділення Нової Пошти. Оплата при отриманні —
					спершу приміряєте, потім платите.
				</span>
			</p>
		</form>
	</Dialog.Content>
</Dialog.Root>
