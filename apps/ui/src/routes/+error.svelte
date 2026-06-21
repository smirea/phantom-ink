<script lang="ts">
	import { page } from '$app/state';
	import ErrorBox from '$lib/ErrorBox.svelte';

	const error = $derived(page.error ?? new Error(String(page.status)));
</script>

<section class="route-error">
	<div class="route-error-status">{page.status}</div>
	<ErrorBox {error} />
</section>

<style>
	.route-error {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	.route-error-status {
		color: var(--app-text);
		font-family: var(--font-mono);
		font-size: clamp(1.4rem, 8vw, 2.15rem);
		font-weight: 900;
		line-height: 1;
	}
</style>
