<script lang="ts">
	import type { Snippet } from 'svelte';

	type ButtonSize = 'sm' | 'md' | 'lg';
	type ButtonType = 'button' | 'submit' | 'reset';

	let {
		children,
		disabled = false,
		onclick,
		primary = false,
		size = 'md',
		type = 'button',
	}: {
		children?: Snippet;
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		primary?: boolean;
		size?: ButtonSize;
		type?: ButtonType;
	} = $props();

	const className = $derived(`ink-button ${primary ? 'primary' : ''} ${size}`);
</script>

<button {type} {disabled} class={className} {onclick}>
	{@render children?.()}
</button>

<style>
	.ink-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		width: fit-content;
		min-width: 0;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: var(--app-input);
		box-shadow: 0 0 0 0 color-mix(in oklab, var(--app-accent) 0%, transparent);
		color: var(--app-text);
		font: inherit;
		font-weight: 800;
		line-height: 1;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			box-shadow 220ms ease,
			color 180ms ease,
			opacity 180ms ease,
			transform 180ms ease;
	}

	.ink-button.sm {
		min-height: 2rem;
		padding: 0 0.65rem;
		font-size: 0.78rem;
	}

	.ink-button.md {
		min-height: 2.5rem;
		padding: 0 0.9rem;
		font-size: 0.9rem;
	}

	.ink-button.lg {
		min-height: 3rem;
		padding: 0 1.05rem;
		font-size: 0.98rem;
	}

	.ink-button.primary {
		border-color: var(--app-accent);
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.ink-button:hover:not(:disabled) {
		border-color: var(--app-accent-strong);
		box-shadow: 0 0.5rem 1.2rem color-mix(in oklab, var(--app-accent) 18%, transparent);
		transform: translateY(-1px);
	}

	.ink-button:active:not(:disabled) {
		box-shadow: 0 0.15rem 0.45rem color-mix(in oklab, var(--app-accent) 14%, transparent);
		transform: translateY(1px) scale(0.99);
	}

	.ink-button:focus-visible {
		outline: 2px solid var(--app-focus);
		outline-offset: 3px;
	}

	.ink-button:disabled {
		cursor: not-allowed;
		opacity: 0.52;
	}
</style>
