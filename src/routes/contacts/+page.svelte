<script lang="ts">
	import InfoPage from '$lib/components/layout/info-page.svelte';
	import PageMeta from '$lib/components/layout/page-meta.svelte';
	import { SENDER, SITE } from '$lib/config';
	import { FACTS, telHref } from '$lib/store-facts';
</script>

<PageMeta
	title="Контакти — {SITE.name}"
	description="Як зв’язатися з {SITE.name}: телефон, пошта, Instagram. Самовивіз — {SENDER.pickupAddress}."
	canonical="/contacts"
/>

<InfoPage
	title="Контакти"
	lead="Допоможемо з розміром, розкажемо про тканину й підкажемо, як оформити обмін."
>
	<section aria-labelledby="reach-heading">
		<h2 id="reach-heading" class="font-heading text-2xl">Зв’язатися з нами</h2>
		<!-- Список визначень: «що — як» читається однаково і людиною, і
		     скрінрідером, і пошуковиком. -->
		<dl class="mt-4 divide-y border-y">
			<div class="grid grid-cols-[8rem_1fr] gap-4 py-3">
				<dt class="text-muted-foreground">Телефон</dt>
				<dd><a href={telHref(SITE.phone)} class="hover:underline">{SITE.phone}</a></dd>
			</div>
			<div class="grid grid-cols-[8rem_1fr] gap-4 py-3">
				<dt class="text-muted-foreground">Пошта</dt>
				<dd><a href="mailto:{SITE.email}" class="hover:underline">{SITE.email}</a></dd>
			</div>
			<div class="grid grid-cols-[8rem_1fr] gap-4 py-3">
				<dt class="text-muted-foreground">Instagram</dt>
				<dd>
					<a
						href={SITE.instagram}
						rel="noreferrer noopener"
						target="_blank"
						class="hover:underline"
					>
						{SITE.instagram.replace(/^https?:\/\/(www\.)?/, '')}
					</a>
				</dd>
			</div>
		</dl>
	</section>

	<section aria-labelledby="pickup-heading">
		<h2 id="pickup-heading" class="font-heading text-2xl">Самовивіз</h2>
		<p class="mt-3 text-muted-foreground">{FACTS.pickup}</p>
	</section>

	<section aria-labelledby="help-heading">
		<h2 id="help-heading" class="font-heading text-2xl">Корисне</h2>
		<ul class="mt-3 space-y-2">
			<li>
				<a href="/delivery" class="underline underline-offset-4">Доставка і оплата</a>
			</li>
			<li>
				<a href="/returns" class="underline underline-offset-4">Обмін і повернення</a>
			</li>
		</ul>
	</section>
</InfoPage>
