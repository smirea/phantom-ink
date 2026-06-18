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
		fill = false,
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
		fill?: boolean;
		type?: ButtonType;
	} = $props();

	const className = $derived(
		['ink-button', primary ? 'primary' : '', loading ? 'loading' : '', fill ? 'fill' : '', size, cls]
			.filter(Boolean)
			.join(' '),
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
		min-width: 0;
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		background: var(--app-input);
		box-shadow: 0 0 0 0 color-mix(in oklab, var(--app-accent) 0%, transparent);
		color: var(--app-text);
		font: inherit;
		font-weight: 800;
		letter-spacing: 0;
		line-height: 1;
		white-space: nowrap;
		cursor: pointer;
		isolation: isolate;
		overflow: hidden;
		transition:
			background 180ms ease,
			background-position 360ms ease,
			border-color 180ms ease,
			box-shadow 220ms ease,
			color 180ms ease,
			filter 220ms ease,
			opacity 180ms ease,
			transform 180ms ease;
	}

	.ink-button.fill {
		width: 100%;
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
		border-color: color-mix(in oklab, var(--app-accent-strong) 70%, var(--app-accent) 30%);
		background:
			radial-gradient(
				120% 140% at 18% -20%,
				color-mix(in oklab, var(--app-accent-strong) 62%, white 10%) 0%,
				transparent 46%
			),
			radial-gradient(140% 150% at 88% 118%, color-mix(in oklab, var(--app-accent) 80%, black 34%) 0%, transparent 56%),
			repeating-linear-gradient(112deg, color-mix(in oklab, white 7%, transparent) 0 1px, transparent 1px 4px),
			repeating-linear-gradient(24deg, color-mix(in oklab, black 9%, transparent) 0 1px, transparent 1px 5px),
			linear-gradient(
				180deg,
				color-mix(in oklab, var(--app-accent) 78%, #6f3c8f 22%),
				color-mix(in oklab, var(--app-accent) 62%, #32123f 38%)
			);
		background-position:
			0 0,
			100% 100%,
			0 0,
			0 0,
			0 0;
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, white 14%, transparent),
			inset 0 0.9rem 1.4rem color-mix(in oklab, white 5%, transparent),
			inset 0 -0.7rem 1.1rem color-mix(in oklab, #260a36 28%, transparent);
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

	.ink-button.primary:hover:not(:disabled) {
		border-color: color-mix(in oklab, var(--app-accent-strong) 86%, var(--app-accent) 14%);
		background-position:
			4% -5%,
			96% 108%,
			0.12rem 0,
			-0.1rem 0,
			0 0;
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, white 18%, transparent),
			inset 0 0.9rem 1.4rem color-mix(in oklab, white 7%, transparent),
			inset 0 -0.72rem 1.16rem color-mix(in oklab, #260a36 30%, transparent),
			0 0 0.55rem color-mix(in oklab, var(--app-accent-strong) 18%, transparent),
			0 0 1rem color-mix(in oklab, var(--app-accent) 10%, transparent);
		filter: saturate(1.1) brightness(1.02);
		transform: none;
		animation: ink-button-primary-pulse 1700ms ease-in-out infinite;
	}

	.ink-button.primary:active:not(:disabled) {
		background-position:
			2% -2%,
			98% 106%,
			0.22rem 0,
			-0.18rem 0,
			0 0;
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, black 14%, transparent),
			inset 0 0.55rem 0.9rem color-mix(in oklab, #260a36 24%, transparent),
			inset 0 -0.2rem 0.75rem color-mix(in oklab, #8f4fba 10%, transparent),
			0 0 0.42rem color-mix(in oklab, var(--app-accent-strong) 14%, transparent);
		filter: saturate(1.06) brightness(0.96);
		transform: scale(0.99);
		animation: ink-button-primary-tap 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
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

	@keyframes ink-button-primary-pulse {
		0%,
		100% {
			background-position:
				4% -5%,
				96% 108%,
				0.12rem 0,
				-0.1rem 0,
				0 0;
			box-shadow:
				inset 0 0 0 1px color-mix(in oklab, white 18%, transparent),
				inset 0 0.9rem 1.4rem color-mix(in oklab, white 7%, transparent),
				inset 0 -0.72rem 1.16rem color-mix(in oklab, #260a36 30%, transparent),
				0 0 0.55rem color-mix(in oklab, var(--app-accent-strong) 18%, transparent),
				0 0 1rem color-mix(in oklab, var(--app-accent) 10%, transparent);
			filter: saturate(1.08) brightness(1.01);
		}

		50% {
			background-position:
				7% -8%,
				93% 112%,
				0.32rem 0,
				-0.28rem 0,
				0 0;
			box-shadow:
				inset 0 0 0 1px color-mix(in oklab, white 23%, transparent),
				inset 0 1rem 1.55rem color-mix(in oklab, white 10%, transparent),
				inset 0 -0.78rem 1.28rem color-mix(in oklab, #260a36 34%, transparent),
				0 0 0.95rem color-mix(in oklab, var(--app-accent-strong) 30%, transparent),
				0 0 1.45rem color-mix(in oklab, #8f4fba 18%, transparent);
			filter: saturate(1.18) brightness(1.045);
		}
	}

	@keyframes ink-button-primary-tap {
		0% {
			background-position:
				4% -5%,
				96% 108%,
				0.12rem 0,
				-0.1rem 0,
				0 0;
			box-shadow:
				inset 0 0 0 1px color-mix(in oklab, white 18%, transparent),
				inset 0 0.9rem 1.4rem color-mix(in oklab, white 7%, transparent),
				inset 0 -0.72rem 1.16rem color-mix(in oklab, #260a36 30%, transparent),
				0 0 0.65rem color-mix(in oklab, var(--app-accent-strong) 18%, transparent);
			filter: saturate(1.1) brightness(1.02);
			transform: scale(1);
		}

		48% {
			background-position:
				1% 0,
				99% 104%,
				0.28rem 0,
				-0.24rem 0,
				0 0;
			box-shadow:
				inset 0 0 0 1px color-mix(in oklab, black 18%, transparent),
				inset 0 0.45rem 0.8rem color-mix(in oklab, #260a36 30%, transparent),
				inset 0 -0.15rem 0.7rem color-mix(in oklab, #8f4fba 13%, transparent),
				0 0 0.28rem color-mix(in oklab, var(--app-accent-strong) 11%, transparent);
			filter: saturate(1.04) brightness(0.93);
			transform: scale(0.986);
		}

		100% {
			background-position:
				2% -2%,
				98% 106%,
				0.22rem 0,
				-0.18rem 0,
				0 0;
			box-shadow:
				inset 0 0 0 1px color-mix(in oklab, black 14%, transparent),
				inset 0 0.55rem 0.9rem color-mix(in oklab, #260a36 24%, transparent),
				inset 0 -0.2rem 0.75rem color-mix(in oklab, #8f4fba 10%, transparent),
				0 0 0.42rem color-mix(in oklab, var(--app-accent-strong) 14%, transparent);
			filter: saturate(1.06) brightness(0.96);
			transform: scale(0.99);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ink-button.primary:hover:not(:disabled),
		.ink-button.primary:active:not(:disabled) {
			animation: none;
		}
	}
</style>
