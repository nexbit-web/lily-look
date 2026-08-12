<script lang="ts">
	import { enhance } from '$app/forms';
	import DeliveryFields from '$lib/components/checkout/delivery-fields.svelte';
	import Field from '$lib/components/checkout/field.svelte';
	import PhoneField from '$lib/components/checkout/phone-field.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import { DELIVERY_METHODS, deliveryCostFor, type DeliveryMethodValue } from '$lib/config';
	import { formatPrice } from '$lib/money';
	import type { CartView } from '$lib/types';
	import BanknoteIcon from '@lucide/svelte/icons/banknote';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import toast from 'svelte-hot-french-toast';

	let {
		cart,
		novaPoshtaLive,
		serverErrors,
		serverMessage
	}: {
		cart: CartView;
		novaPoshtaLive: boolean;
		serverErrors: Record<string, string>;
		serverMessage: string;
	} = $props();

	let customerName = $state('');
	let phoneDigits = $state('');
	let customerEmail = $state('');
	let comment = $state('');
	let deliveryMethod = $state<DeliveryMethodValue>('NOVA_POSHTA_BRANCH');
	let city = $state('');
	let address = $state('');
	let cityRef = $state('');
	/** Реальний тариф НП; null — ще невідомий або перевізник інший. */
	let liveCost = $state<number | null>(null);
	let costLoading = $state(false);

	let submitting = $state(false);
	/** Помилки показуємо лише після спроби відправки або виходу з поля — */
	/** інакше форма червоніє ще до того, як користувач почав її заповнювати. */
	let touched = $state<Record<string, boolean>>({});
	let attempted = $state(false);

	const needsAddress = $derived(
		(DELIVERY_METHODS.find((item) => item.value === deliveryMethod) ?? DELIVERY_METHODS[0]).kind !==
			'pickup'
	);

	/** Перевірки дублюють серверні — тут вони лише швидша підказка. */
	const validation = $derived.by(() => {
		const result: Record<string, string> = {};

		if (customerName.trim().length < 2) result.customerName = 'Вкажіть ім’я та прізвище';
		if (!phoneDigits) result.customerPhone = 'Вкажіть номер телефону';
		else if (phoneDigits.length < 10) result.customerPhone = 'Номер має містити 10 цифр';
		else if (!phoneDigits.startsWith('0')) result.customerPhone = 'Номер має починатися з нуля';
		if (customerEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail.trim())) {
			result.customerEmail = 'Некоректний email';
		}
		if (needsAddress) {
			if (!city.trim()) result.deliveryCity = 'Оберіть населений пункт';
			if (!address.trim()) result.deliveryAddress = 'Оберіть відділення або вкажіть адресу';
		}
		if (comment.length > 500) result.comment = 'Не більше 500 символів';

		return result;
	});

	const isValid = $derived(Object.keys(validation).length === 0);

	/** Що реально показати: серверна помилка або клієнтська після дотику. */
	const errors = $derived.by(() => {
		const result: Record<string, string> = { ...serverErrors };
		for (const [field, message] of Object.entries(validation)) {
			if (attempted || touched[field]) result[field] ??= message;
		}
		return result;
	});

	/**
	 * Той самий порядок, що й на сервері (resolveDeliveryCost):
	 * безкоштовно від порогу → реальний тариф НП → фіксована ставка.
	 */
	const baseCost = $derived(deliveryCostFor(deliveryMethod, cart.subtotal));
	const deliveryCost = $derived(baseCost === 0 ? 0 : (liveCost ?? baseCost));
	const total = $derived(cart.subtotal + deliveryCost);

	function markTouched(field: string) {
		touched[field] = true;
	}
</script>

<form
	method="POST"
	class="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]"
	use:enhance={({ cancel }) => {
		attempted = true;

		// Неповну форму зупиняємо тут, до запиту на сервер. Єдина точка
		// відправки — інакше клієнтський і серверний тости дублюються.
		if (!isValid) {
			toast.error('Заповніть виділені поля');
			cancel();
			return;
		}

		submitting = true;
		return async ({ result, update }) => {
			submitting = false;
			if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'Перевірте виділені поля'));
			}
			await update({ reset: false });
		};
	}}
>
	<div class="space-y-10">
		<section class="space-y-4">
			<div>
				<h2 class="font-heading text-xl">Контактні дані</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Менеджер зателефонує, щоб підтвердити замовлення.
				</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<Field
					id="customerName"
					label="Ім’я та прізвище"
					required
					error={errors.customerName ?? ''}
				>
					<Input
						id="customerName"
						name="customerName"
						placeholder="Олена Ковальчук"
						autocomplete="name"
						aria-invalid={Boolean(errors.customerName)}
						bind:value={customerName}
						onblur={() => markTouched('customerName')}
					/>
				</Field>

				<Field
					id="customerPhone"
					label="Телефон"
					required
					error={errors.customerPhone ?? ''}
					hint="10 цифр після +38"
				>
					<PhoneField
						invalid={Boolean(errors.customerPhone)}
						onblur={() => markTouched('customerPhone')}
						bind:digits={phoneDigits}
					/>
				</Field>
			</div>

			<Field
				id="customerEmail"
				label="Email"
				error={errors.customerEmail ?? ''}
				hint="Надішлемо номер накладної, коли відправимо замовлення"
			>
				<Input
					id="customerEmail"
					name="customerEmail"
					type="email"
					placeholder="olena@example.com"
					autocomplete="email"
					aria-invalid={Boolean(errors.customerEmail)}
					bind:value={customerEmail}
					onblur={() => markTouched('customerEmail')}
				/>
			</Field>
		</section>

		<DeliveryFields
			bind:method={deliveryMethod}
			bind:city
			bind:address
			bind:cityRef
			bind:liveCost
			bind:costLoading
			subtotal={cart.subtotal}
			{novaPoshtaLive}
			{errors}
		/>

		<section class="space-y-4">
			<h2 class="font-heading text-xl">Оплата</h2>

			<div class="rounded-xl border border-success/30 bg-success/5 p-5">
				<div class="flex items-start gap-4">
					<span
						class="flex size-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
					>
						<BanknoteIcon class="size-5" />
					</span>
					<div class="space-y-1">
						<p class="font-medium">Оплата при отриманні</p>
						<p class="text-sm text-muted-foreground">
							Платите на відділенні або кур’єру після того, як оглянете замовлення. Передоплата не
							потрібна.
						</p>
					</div>
				</div>

				<div class="mt-4 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
					<ShieldCheckIcon class="size-4 shrink-0 text-success" />
					Не підійде розмір — обмін або повернення протягом 14 днів.
				</div>
			</div>
		</section>

		<section class="space-y-4">
			<h2 class="font-heading text-xl">Коментар</h2>
			<Field id="comment" label="Побажання до замовлення" error={errors.comment ?? ''}>
				<Textarea
					id="comment"
					name="comment"
					rows={3}
					placeholder="Наприклад: зателефонуйте після 18:00"
					bind:value={comment}
					onblur={() => markTouched('comment')}
				/>
			</Field>
		</section>
	</div>

	<aside class="lg:sticky lg:top-24 lg:self-start">
		<div class="space-y-4 rounded-2xl border p-6">
			<h2 class="font-heading text-lg">Ваше замовлення</h2>

			<ul class="space-y-3">
				{#each cart.lines as line (line.id)}
					<li class="flex justify-between gap-3 text-sm">
						<span class="text-muted-foreground">
							{line.productName}
							<span class="block text-xs">{line.color} · {line.size} · {line.quantity} шт.</span>
						</span>
						<span class="tabular-nums">{formatPrice(line.lineTotal)}</span>
					</li>
				{/each}
			</ul>

			<div class="space-y-2 border-t pt-4 text-sm">
				<div class="flex justify-between">
					<span class="text-muted-foreground">Товари</span>
					<span class="tabular-nums">{formatPrice(cart.subtotal)}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Доставка</span>
					{#if costLoading && baseCost !== 0}
						<Skeleton class="h-4 w-16 rounded-md" />
					{:else}
						<span class="tabular-nums {deliveryCost === 0 ? 'font-medium text-success' : ''}">
							{deliveryCost === 0 ? 'Безкоштовно' : formatPrice(deliveryCost)}
						</span>
					{/if}
				</div>

				{#if deliveryCost > 0 && liveCost !== null}
					<p class="text-xs text-muted-foreground">Точний тариф Нової Пошти для вашого напрямку.</p>
				{/if}
			</div>

			<div class="flex justify-between border-t pt-4">
				<span>До сплати</span>
				<span class="font-medium tabular-nums">{formatPrice(total)}</span>
			</div>

			{#if serverMessage}
				<p class="flex items-start gap-2 text-xs text-destructive" role="alert">
					<TriangleAlertIcon class="mt-0.5 size-3.5 shrink-0" />
					{serverMessage}
				</p>
			{/if}

			<Button
				type="submit"
				size="lg"
				class="w-full bg-success text-success-foreground hover:bg-success/90"
				disabled={submitting || (attempted && !isValid)}
			>
				{#if submitting}
					<LoaderIcon class="animate-spin" />
				{/if}
				Підтвердити замовлення
			</Button>

			<p class="text-center text-xs text-muted-foreground">
				Натискаючи кнопку, ви погоджуєтесь на обробку персональних даних.
			</p>
		</div>
	</aside>
</form>
