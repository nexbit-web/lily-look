<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
</script>

<div class="mx-auto max-w-md px-4 py-32 text-center">
	<p class="font-heading text-6xl">{page.status}</p>
	<p class="mt-4 text-muted-foreground">
		{page.error?.message ?? 'Щось пішло не так'}
	</p>
	<Button href="/" class="mt-8">На головну</Button>
</div>
