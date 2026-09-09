<script lang="ts">
	import { FREE_DELIVERY_FROM, RETURN_DAYS, SENDER, SITE } from '$lib/config';
	import { plural } from '$lib/plural';
	import { formatPrice } from '$lib/money';
	import type { CategoryLink } from '$lib/types';

	let { categories }: { categories: CategoryLink[] } = $props();

	const year = new Date().getFullYear();
</script>

<footer class="mt-24 border-t bg-muted/40">
	<div class="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
		<div class="space-y-3">
			<p class="font-heading text-lg tracking-[0.2em] uppercase">{SITE.name}</p>
			<p class="text-sm text-muted-foreground">{SITE.tagline}</p>
			<p class="text-sm text-muted-foreground">
				Безкоштовна доставка від {formatPrice(FREE_DELIVERY_FROM)}
			</p>
		</div>

		<div class="space-y-3">
			<p class="text-sm font-medium">Каталог</p>
			<ul class="space-y-2">
				{#each categories as category (category.slug)}
					<li>
						<a
							href="/catalog/{category.slug}"
							class="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							{category.name}
						</a>
					</li>
				{/each}
			</ul>
		</div>

		<div class="space-y-3">
			<p class="text-sm font-medium">Покупцям</p>
			<ul class="space-y-2 text-sm text-muted-foreground">
				<li>Доставка Новою Поштою по Україні</li>
				<li>Обмін і повернення — {RETURN_DAYS} {plural(RETURN_DAYS, 'день', 'дні', 'днів')}</li>
				<li>Оплата при отриманні</li>
				<li>Самовивіз у {SENDER.city}, {SENDER.region}</li>
			</ul>
		</div>

		<div class="space-y-3">
			<p class="text-sm font-medium">Контакти</p>
			<ul class="space-y-2 text-sm text-muted-foreground">
				<li>
					<a href="tel:{SITE.phone.replace(/\D/g, '')}" class="hover:text-foreground"
						>{SITE.phone}</a
					>
				</li>
				<li><a href="mailto:{SITE.email}" class="hover:text-foreground">{SITE.email}</a></li>
				<li>
					<a
						href={SITE.instagram}
						rel="noreferrer noopener"
						target="_blank"
						class="hover:text-foreground"
					>
						Instagram
					</a>
				</li>
			</ul>
		</div>
	</div>

	<div class="border-t">
		<p class="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
			© {year}
			{SITE.name}. Усі права захищені.
		</p>
	</div>
</footer>
