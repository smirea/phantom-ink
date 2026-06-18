<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { LucideIcon } from '@lucide/svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	type ButtonSize = 'sm' | 'md' | 'lg';
	type ButtonType = 'button' | 'submit' | 'reset';

	let {
		children,
		class: cls,
		disabled = false,
		icon: Icon,
		iconSize,
		iconStrokeWidth,
		loading = false,
		primary = false,
		size = 'md',
		type = 'button',
		...rest
	}: Omit<HTMLButtonAttributes, 'type'> & {
		children?: Snippet;
		icon?: LucideIcon;
		iconSize?: number | string;
		iconStrokeWidth?: number | string;
		loading?: boolean;
		primary?: boolean;
		size?: ButtonSize;
		type?: ButtonType;
	} = $props();

	const className = $derived(
		['ink-button', primary ? 'primary' : '', loading ? 'loading' : '', size, cls].filter(Boolean).join(' '),
	);
	const DisplayIcon = $derived(loading ? LoaderCircle : Icon);
	const isDisabled = $derived(disabled || loading);
	const resolvedIconSize = $derived(iconSize ?? (size === 'lg' ? 26 : size === 'sm' ? 17 : 20));
	const resolvedIconCssSize = $derived(formatCssSize(resolvedIconSize));
	const resolvedIconStrokeWidth = $derived(iconStrokeWidth ?? (size === 'lg' ? 2.5 : 2.3));

	function formatCssSize(value: number | string): string {
		return typeof value === 'number' ? `${value}px` : value;
	}
</script>

<button {...rest} {type} aria-busy={loading || undefined} disabled={isDisabled} class={className}>
	{#if DisplayIcon}
		<span
			class:loading
			class="ink-button-icon"
			style={`--ink-button-icon-size: ${resolvedIconCssSize}`}
			aria-hidden="true"
		>
			<DisplayIcon size={resolvedIconSize} strokeWidth={resolvedIconStrokeWidth} />
		</span>
	{/if}
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
		letter-spacing: 0;
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

	.ink-button-icon {
		display: inline-grid;
		place-items: center;
		width: var(--ink-button-icon-size);
		height: var(--ink-button-icon-size);
		flex: 0 0 auto;
	}

	.ink-button-icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.ink-button-icon.loading {
		animation: ink-button-spin 850ms linear infinite;
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

	@keyframes ink-button-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
