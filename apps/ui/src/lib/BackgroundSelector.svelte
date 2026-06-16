<script lang="ts">
	import { type BackgroundState, backgroundOptions } from '$lib/backgroundState.svelte';

	let { state: backgroundState }: { state: BackgroundState } = $props();
</script>

<label class="background-selector">
	<span>Background</span>
	<select bind:value={backgroundState.selectedBackgroundId} aria-label="Background renderer">
		{#each backgroundOptions as option}
			<option value={option.id}>{option.label}</option>
		{/each}
	</select>
</label>

<style>
	.background-selector {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 76%, transparent);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--app-panel) 90%, transparent);
		box-shadow: 0 0.8rem 2rem color-mix(in oklab, black 28%, transparent);
		color: var(--app-panel-text);
		font-size: 0.72rem;
		font-weight: 800;
		padding: 0.45rem;
		pointer-events: auto;
		backdrop-filter: blur(1rem);
	}

	.background-selector span {
		color: var(--app-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.background-selector select {
		min-width: 8.2rem;
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		background: var(--app-input);
		color: var(--app-text);
		font: inherit;
		padding: 0.28rem 0.45rem;
	}

	@media (max-width: 520px) {
		.background-selector {
			top: auto;
			bottom: 0.55rem;
			left: 0.55rem;
			max-width: calc(100vw - 1.1rem);
		}

		.background-selector span {
			display: none;
		}
	}
</style>
