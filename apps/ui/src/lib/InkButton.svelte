<script lang="ts">
	import VoteBadge from '$lib/VoteBadge.svelte';
	import { getAppContext } from '$lib/appContext';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { LucideIcon } from '@lucide/svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { User } from '@repo/shared/onlineGame';

	type ButtonSize = 'sm' | 'md' | 'lg';
	type ButtonType = 'button' | 'submit' | 'reset';
	type VotingState = { voted: User['id'][]; eligible: User[]; required?: number };

	let {
		children,
		class: cls,
		disabled = false,
		fill = false,
		ghost = false,
		icon: Icon,
		iconSize,
		iconStrokeWidth,
		loading = false,
		primary = false,
		selfVoted,
		size = 'md',
		type = 'button',
		voteLabel,
		voting,
		...rest
	}: Omit<HTMLButtonAttributes, 'type'> & {
		children?: Snippet;
		icon?: LucideIcon;
		iconSize?: number | string;
		iconStrokeWidth?: number | string;
		loading?: boolean;
		ghost?: boolean;
		primary?: boolean;
		selfVoted?: boolean;
		size?: ButtonSize;
		fill?: boolean;
		type?: ButtonType;
		voteLabel?: string;
		voting?: VotingState;
	} = $props();

	const appContext = getAppContext();
	const variant = $derived(primary ? 'primary' : ghost ? 'ghost' : 'default');
	const className = $derived(['ink-button', cls].filter(Boolean).join(' '));
	const DisplayIcon = $derived(loading ? LoaderCircle : Icon);
	const isDisabled = $derived(disabled || loading);
	const resolvedIconSize = $derived(iconSize ?? (size === 'lg' ? 26 : size === 'sm' ? 17 : 20));
	const resolvedIconCssSize = $derived(formatCssSize(resolvedIconSize));
	const resolvedIconStrokeWidth = $derived(iconStrokeWidth ?? (size === 'lg' ? 2.5 : 2.3));
	const selfHasVoted = $derived(selfVoted ?? Boolean(voting?.voted.includes(appContext.user.id)));

	function formatCssSize(value: number | string): string {
		return typeof value === 'number' ? `${value}px` : value;
	}
</script>

<button
	{...rest}
	{type}
	aria-busy={loading || undefined}
	data-fill={fill ? 'true' : undefined}
	data-loading={loading ? 'true' : undefined}
	data-self-voted={selfHasVoted ? 'true' : undefined}
	data-size={size}
	data-variant={variant}
	disabled={isDisabled}
	class={className}
>
	{#if DisplayIcon}
		<span
			data-loading={loading ? 'true' : undefined}
			class="ink-button-icon"
			style={`--ink-button-icon-size: ${resolvedIconCssSize}`}
			aria-hidden="true"
		>
			<DisplayIcon
				size={resolvedIconSize}
				strokeWidth={resolvedIconStrokeWidth}
				style="display: block; width: 100%; height: 100%;"
			/>
		</span>
	{/if}
	{@render children?.()}
	{#if voting}
		<VoteBadge {voting} label={voteLabel} mode="avatar" passive />
	{/if}
</button>

<style>
	.ink-button {
		--vote-badge-opacity: 0;
		--vote-badge-pointer-events: none;
		--vote-badge-scale: 0.92;
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
		overflow: visible;
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

	.ink-button:hover:not(:disabled),
	.ink-button:focus-visible,
	.ink-button:focus-within,
	.ink-button[data-self-voted='true'] {
		--vote-badge-opacity: 1;
		--vote-badge-pointer-events: auto;
		--vote-badge-scale: 1;
	}

	.ink-button[data-fill='true'] {
		width: 100%;
	}

	.ink-button[data-size='sm'] {
		min-height: 2rem;
		padding: 0 0.65rem;
		font-size: 0.78rem;
	}

	.ink-button[data-size='md'] {
		min-height: 2.5rem;
		padding: 0 0.9rem;
		font-size: 0.9rem;
	}

	.ink-button[data-size='lg'] {
		min-height: 3rem;
		padding: 0 1.05rem;
		font-size: 1.125rem;
	}

	.ink-button[data-variant='ghost'] {
		border-color: color-mix(in oklab, var(--app-border) 70%, transparent);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--app-panel) 62%, transparent);
		box-shadow: none;
		color: var(--app-muted);
		overflow: visible;
	}

	.ink-button[data-variant='ghost']::after {
		position: absolute;
		inset: -0.28rem;
		border: 1px solid currentColor;
		border-radius: inherit;
		opacity: 0;
		pointer-events: none;
		content: '';
	}

	.ink-button[data-variant='primary'] {
		border-color: color-mix(in oklab, var(--app-accent) 54%, var(--app-border) 46%);
		background:
			radial-gradient(
				120% 140% at 18% -20%,
				color-mix(in oklab, var(--app-accent) 68%, #5b4267 32%) 0%,
				transparent 46%
			),
			radial-gradient(
				140% 150% at 88% 118%,
				color-mix(in oklab, var(--app-accent) 54%, #32203b 46%) 0%,
				transparent 56%
			),
			repeating-linear-gradient(112deg, color-mix(in oklab, white 5%, transparent) 0 1px, transparent 1px 4px),
			repeating-linear-gradient(24deg, color-mix(in oklab, black 12%, transparent) 0 1px, transparent 1px 5px),
			linear-gradient(
				180deg,
				color-mix(in oklab, var(--app-accent) 66%, #5b4267 34%),
				color-mix(in oklab, var(--app-accent) 52%, #2e1a38 48%)
			);
		background-position:
			0 0,
			100% 100%,
			0 0,
			0 0,
			0 0;
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, white 9%, transparent),
			inset 0 0.9rem 1.4rem color-mix(in oklab, white 3%, transparent),
			inset 0 -0.7rem 1.1rem color-mix(in oklab, #260a36 26%, transparent);
		color: var(--app-accent-ink);
		font-family: var(--font-fancy);
		font-weight: bold;
	}

	.ink-button-icon {
		display: inline-grid;
		place-items: center;
		width: var(--ink-button-icon-size);
		height: var(--ink-button-icon-size);
		flex: 0 0 auto;
		transition: transform 180ms ease;
	}

	.ink-button-icon[data-loading='true'] {
		animation: ink-button-spin 850ms linear infinite;
	}

	.ink-button:hover:not(:disabled) {
		border-color: var(--app-accent-strong);
		box-shadow: 0 0.5rem 1.2rem color-mix(in oklab, var(--app-accent) 18%, transparent);
		transform: translateY(-1px);
	}

	.ink-button[data-variant='ghost']:hover:not(:disabled) {
		border-color: color-mix(in oklab, var(--app-border) 70%, transparent);
		box-shadow: none;
		color: var(--app-text);
		transform: translateY(-2px);
	}

	.ink-button[data-variant='primary']:hover:not(:disabled) {
		border-color: color-mix(in oklab, var(--app-accent) 64%, var(--app-border) 36%);
		background-position:
			4% -5%,
			96% 108%,
			0.12rem 0,
			-0.1rem 0,
			0 0;
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, white 12%, transparent),
			inset 0 0.9rem 1.4rem color-mix(in oklab, white 4%, transparent),
			inset 0 -0.72rem 1.16rem color-mix(in oklab, #260a36 28%, transparent),
			0 0 0.42rem color-mix(in oklab, var(--app-accent) 12%, transparent),
			0 0 0.82rem color-mix(in oklab, var(--app-accent-strong) 7%, transparent);
		filter: saturate(1.06) brightness(1.01);
		transform: none;
		animation: ink-button-primary-pulse 1700ms ease-in-out infinite;
	}

	.ink-button[data-variant='primary']:active:not(:disabled) {
		background-position:
			2% -2%,
			98% 106%,
			0.22rem 0,
			-0.18rem 0,
			0 0;
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, black 14%, transparent),
			inset 0 0.55rem 0.9rem color-mix(in oklab, #260a36 24%, transparent),
			inset 0 -0.2rem 0.75rem color-mix(in oklab, #8f4fba 7%, transparent),
			0 0 0.34rem color-mix(in oklab, var(--app-accent) 9%, transparent);
		filter: saturate(1.03) brightness(0.95);
		transform: scale(0.99);
		animation: ink-button-primary-tap 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	.ink-button[data-self-voted='true'] {
		border-color: color-mix(in oklab, var(--app-focus) 62%, var(--app-accent) 38%);
		box-shadow:
			0 0 0 1px rgba(217, 194, 140, 0.28),
			0 0 0.85rem rgba(217, 194, 140, 0.32),
			0 0.5rem 1.2rem rgba(168, 135, 183, 0.2);
		color: var(--logo-word);
		transition:
			background 180ms ease,
			background-position 360ms ease,
			border-color 180ms ease,
			color 180ms ease,
			opacity 180ms ease,
			transform 180ms ease;
	}

	.ink-button[data-variant='primary'][data-self-voted='true'] {
		border-color: color-mix(in oklab, var(--app-focus) 68%, var(--app-accent) 32%);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.15),
			inset 0 0.9rem 1.4rem rgba(255, 255, 255, 0.05),
			inset 0 -0.72rem 1.16rem rgba(38, 10, 54, 0.28),
			0 0 0 1px rgba(217, 194, 140, 0.32),
			0 0 0.95rem rgba(217, 194, 140, 0.38),
			0 0.7rem 1.35rem rgba(168, 135, 183, 0.22);
		animation: none;
		color: var(--logo-word);
		filter: saturate(1.08) brightness(1.03);
	}

	.ink-button:active:not(:disabled) {
		box-shadow: 0 0.15rem 0.45rem color-mix(in oklab, var(--app-accent) 14%, transparent);
		transform: translateY(1px) scale(0.99);
	}

	.ink-button[data-variant='ghost']:active:not(:disabled) {
		box-shadow: none;
		transform: translateY(1px) scale(0.94);
	}

	.ink-button[data-variant='ghost'][data-tapped='true'] {
		animation: ink-button-ghost-tap 420ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.ink-button[data-variant='ghost'][data-tapped='true']::after {
		animation: ink-button-ghost-ring 420ms ease-out;
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

	@keyframes ink-button-ghost-tap {
		0% {
			transform: translateY(1px) scale(0.94) rotate(-1deg);
		}

		48% {
			transform: translateY(-3px) scale(1.08) rotate(1.5deg);
		}

		100% {
			transform: translateY(0) scale(1) rotate(0);
		}
	}

	@keyframes ink-button-ghost-ring {
		0% {
			opacity: 0.5;
			transform: scale(0.76);
		}

		100% {
			opacity: 0;
			transform: scale(1.34);
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
				inset 0 0 0 1px color-mix(in oklab, white 12%, transparent),
				inset 0 0.9rem 1.4rem color-mix(in oklab, white 4%, transparent),
				inset 0 -0.72rem 1.16rem color-mix(in oklab, #260a36 28%, transparent),
				0 0 0.42rem color-mix(in oklab, var(--app-accent) 12%, transparent),
				0 0 0.82rem color-mix(in oklab, var(--app-accent-strong) 7%, transparent);
			filter: saturate(1.04) brightness(1);
		}

		50% {
			background-position:
				7% -8%,
				93% 112%,
				0.32rem 0,
				-0.28rem 0,
				0 0;
			box-shadow:
				inset 0 0 0 1px color-mix(in oklab, white 16%, transparent),
				inset 0 1rem 1.55rem color-mix(in oklab, white 6%, transparent),
				inset 0 -0.78rem 1.28rem color-mix(in oklab, #260a36 32%, transparent),
				0 0 0.68rem color-mix(in oklab, var(--app-accent) 18%, transparent),
				0 0 1.05rem color-mix(in oklab, #8f4fba 9%, transparent);
			filter: saturate(1.1) brightness(1.018);
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
				inset 0 0 0 1px color-mix(in oklab, white 12%, transparent),
				inset 0 0.9rem 1.4rem color-mix(in oklab, white 4%, transparent),
				inset 0 -0.72rem 1.16rem color-mix(in oklab, #260a36 28%, transparent),
				0 0 0.48rem color-mix(in oklab, var(--app-accent) 12%, transparent);
			filter: saturate(1.06) brightness(1.01);
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
				inset 0 -0.15rem 0.7rem color-mix(in oklab, #8f4fba 9%, transparent),
				0 0 0.22rem color-mix(in oklab, var(--app-accent) 8%, transparent);
			filter: saturate(1.02) brightness(0.92);
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
				inset 0 -0.2rem 0.75rem color-mix(in oklab, #8f4fba 7%, transparent),
				0 0 0.34rem color-mix(in oklab, var(--app-accent) 9%, transparent);
			filter: saturate(1.03) brightness(0.95);
			transform: scale(0.99);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ink-button[data-variant='primary']:hover:not(:disabled),
		.ink-button[data-variant='primary']:active:not(:disabled),
		.ink-button[data-variant='ghost'][data-tapped='true'],
		.ink-button[data-variant='ghost'][data-tapped='true']::after {
			animation: none;
		}
	}
</style>
