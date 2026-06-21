<script lang="ts">
	import GameRunes from '$lib/GameRunes.svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { fade } from 'svelte/transition';

	type CardVariant = 'question' | 'answer' | 'clue' | 'result';
	type CardResult = 'win' | 'lose';
	type RuneSize = 'default' | 'panel' | 'card-title' | 'card-body' | 'answer-title' | 'answer-body' | 'clue-body';
	type RuneConfig = { words?: number; min?: number; max?: number };
	type TransitionReturn = ReturnType<typeof fade> | (() => ReturnType<typeof fade>);
	type TransitionFn = (node: Element, params: { key: string }) => TransitionReturn;

	type Props = Omit<HTMLButtonAttributes, 'children' | 'type'> &
		Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
			bodyFancy?: boolean;
			bodyRedacted?: boolean;
			bodyRune?: RuneConfig;
			bodyRuneSize?: RuneSize;
			bodyText?: string;
			children?: Snippet;
			compact?: boolean;
			danceDelay?: string;
			dancing?: boolean;
			disabled?: boolean;
			fillHeight?: boolean;
			footer?: Snippet;
			footerVisible?: boolean;
			interactive?: boolean;
			receiveTransition?: TransitionFn;
			redacted?: boolean;
			redactionKey?: string;
			result?: CardResult;
			selected?: boolean;
			sendTransition?: TransitionFn;
			title: string;
			titleAddon?: Snippet;
			titleAddonVisible?: boolean;
			titleFancy?: boolean;
			titleRedacted?: boolean;
			titleRune?: RuneConfig;
			titleRuneSize?: RuneSize;
			transitionKey?: string;
			type?: 'button' | 'submit' | 'reset';
			variant?: CardVariant;
			voted?: boolean;
		};

	let {
		bodyFancy = false,
		bodyRedacted,
		bodyRune,
		bodyRuneSize = 'card-body',
		bodyText,
		children,
		class: cls,
		compact = false,
		danceDelay,
		dancing = false,
		disabled = false,
		fillHeight = false,
		footer,
		footerVisible = Boolean(footer),
		interactive = false,
		receiveTransition,
		redacted = false,
		redactionKey,
		result,
		selected = false,
		sendTransition,
		style,
		title,
		titleAddon,
		titleAddonVisible = Boolean(titleAddon),
		titleFancy = true,
		titleRedacted,
		titleRune,
		titleRuneSize = 'card-title',
		transitionKey,
		type = 'button',
		variant = 'question',
		voted = false,
		...rest
	}: Props = $props();

	const resolvedTitleRedacted = $derived(titleRedacted ?? redacted);
	const resolvedBodyRedacted = $derived(bodyRedacted ?? redacted);
	const resolvedRedactionKey = $derived(redactionKey ?? title);
	const displayTitle = $derived(titleFancy && !resolvedTitleRedacted ? titleCase(title) : title);
	const shellClass = $derived(['game-card-shell', cls].filter(Boolean).join(' '));
	const shellStyle = $derived(
		[style, dancing && danceDelay ? `--game-card-dance-delay: ${danceDelay}` : undefined].filter(Boolean).join('; '),
	);
	const transitionParams = $derived({ key: transitionKey ?? resolvedRedactionKey });
	const inTransition = $derived(receiveTransition ?? noopTransition);
	const outTransition = $derived(sendTransition ?? noopTransition);

	function noopTransition() {
		return { duration: 0 };
	}

	function titleCase(value: string): string {
		return value.toLowerCase().replace(/(^|[\s/-])([a-z0-9])/g, (_, prefix: string, char: string) => {
			return `${prefix}${char.toUpperCase()}`;
		});
	}
</script>

{#snippet CardContent()}
	<span class="game-card-title">
		<span class="game-card-title-text">
			{#if resolvedTitleRedacted}
				<GameRunes
					hash={`${resolvedRedactionKey}:title`}
					words={titleRune?.words ?? 1}
					min={titleRune?.min ?? 4}
					max={titleRune?.max ?? 16}
					size={titleRuneSize}
				/>
			{:else}
				{displayTitle}
			{/if}
		</span>
		{#if titleAddon && titleAddonVisible}
			<span class="game-card-title-addon" transition:fade={{ duration: 160 }}>
				{@render titleAddon()}
			</span>
		{/if}
	</span>
	<span class="game-card-body" data-fancy={bodyFancy ? 'true' : undefined}>
		{#if resolvedBodyRedacted}
			<GameRunes
				hash={`${resolvedRedactionKey}:body`}
				words={bodyRune?.words ?? 5}
				min={bodyRune?.min ?? 3}
				max={bodyRune?.max ?? 9}
				size={bodyRuneSize}
			/>
		{:else if children}
			{@render children()}
		{:else if bodyText !== undefined}
			{#if bodyFancy}
				<span class="game-card-body-fancy">{bodyText}</span>
			{:else}
				{bodyText}
			{/if}
		{/if}
	</span>
	{#if footer && footerVisible}
		<span class="game-card-footer">
			{@render footer()}
		</span>
	{/if}
{/snippet}

<span
	class={shellClass}
	data-compact={compact ? 'true' : undefined}
	data-dancing={dancing ? 'true' : undefined}
	data-fill-height={fillHeight ? 'true' : undefined}
	data-variant={variant}
	style={shellStyle || undefined}
	in:inTransition={transitionParams}
	out:outTransition={transitionParams}
>
	{#if interactive}
		<button
			{...rest}
			{disabled}
			{type}
			class="game-card"
			data-compact={compact ? 'true' : undefined}
			data-fill-height={fillHeight ? 'true' : undefined}
			data-redacted={redacted ? 'true' : undefined}
			data-result={result}
			data-selected={selected ? 'true' : undefined}
			data-title-fancy={titleFancy ? 'true' : undefined}
			data-variant={variant}
			data-voted={voted ? 'true' : undefined}
		>
			{@render CardContent()}
		</button>
	{:else}
		<div
			{...rest}
			class="game-card"
			data-compact={compact ? 'true' : undefined}
			data-fill-height={fillHeight ? 'true' : undefined}
			data-redacted={redacted ? 'true' : undefined}
			data-result={result}
			data-selected={selected ? 'true' : undefined}
			data-title-fancy={titleFancy ? 'true' : undefined}
			data-variant={variant}
			data-voted={voted ? 'true' : undefined}
		>
			{@render CardContent()}
		</div>
	{/if}
</span>

<style>
	.game-card-shell {
		display: block;
		min-width: 0;
	}

	.game-card-shell[data-fill-height='true'] {
		height: 100%;
		min-height: 0;
	}

	.game-card-shell[data-dancing='true'] {
		animation: game-card-float 4600ms ease-in-out infinite;
		animation-delay: var(--game-card-dance-delay, 0ms);
		will-change: transform;
	}

	.game-card {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 13.5rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 76%, var(--app-accent) 24%);
		border-radius: 0.5rem;
		background:
			radial-gradient(110% 85% at 14% -8%, color-mix(in oklab, var(--app-sun) 18%, transparent), transparent 50%),
			radial-gradient(120% 100% at 96% 112%, color-mix(in oklab, var(--app-moon) 24%, transparent), transparent 56%),
			linear-gradient(160deg, color-mix(in oklab, var(--app-panel) 90%, white 10%), var(--app-panel) 58%),
			var(--app-panel);
		box-shadow:
			0 1.25rem 3rem color-mix(in oklab, black 46%, transparent),
			0 0.28rem 0 color-mix(in oklab, black 28%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 12%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 34%, transparent);
		color: var(--app-text);
		cursor: default;
		overflow: hidden;
		padding: 0;
		text-align: left;
		transform: translateY(0) scale(1);
		transform-style: preserve-3d;
		transition:
			border-color 220ms ease,
			box-shadow 260ms ease,
			color 180ms ease,
			filter 260ms ease,
			transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.game-card[data-fill-height='true'] {
		height: 100%;
		min-height: 0;
	}

	.game-card[data-compact='true'] {
		min-height: 5.6rem;
	}

	button.game-card {
		cursor: pointer;
	}

	.game-card::before {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(110deg, transparent 0 24%, color-mix(in oklab, white 11%, transparent) 32%, transparent 42%),
			repeating-linear-gradient(28deg, color-mix(in oklab, white 4%, transparent) 0 1px, transparent 1px 6px);
		opacity: 0.4;
		pointer-events: none;
		transform: translateZ(1.25rem);
		content: '';
	}

	button.game-card:hover,
	button.game-card:focus-visible {
		border-color: color-mix(in oklab, var(--app-focus) 54%, var(--app-border) 46%);
		box-shadow:
			0 1.7rem 3.6rem color-mix(in oklab, black 52%, transparent),
			0 0.42rem 0 color-mix(in oklab, black 32%, transparent),
			0 0 1.4rem color-mix(in oklab, var(--app-accent) 18%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 16%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 38%, transparent);
		filter: saturate(1.08);
		transform: translateY(-0.32rem) scale(1.008);
	}

	button.game-card:disabled {
		cursor: default;
		opacity: 1;
	}

	button.game-card:active:not(:disabled) {
		transform: translateY(-0.08rem) scale(0.995);
	}

	.game-card[data-voted='true'],
	.game-card[data-selected='true'] {
		border-color: color-mix(in oklab, var(--app-focus) 62%, var(--app-sun) 38%);
		box-shadow:
			0 1.45rem 3.15rem color-mix(in oklab, black 48%, transparent),
			0 0 0 1px color-mix(in oklab, var(--app-focus) 26%, transparent),
			0 0 1.1rem color-mix(in oklab, var(--app-focus) 22%, transparent),
			0 0.32rem 0 color-mix(in oklab, black 30%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 14%, transparent);
		color: var(--logo-word);
	}

	.game-card[data-variant='answer'] {
		min-height: clamp(10rem, 30dvh, 16rem);
	}

	.game-card[data-variant='answer'][data-selected='true'] {
		border-color: color-mix(in oklab, var(--app-focus) 64%, var(--app-sun) 36%);
		box-shadow:
			0 1.6rem 3.4rem color-mix(in oklab, black 48%, transparent),
			0 0 1.35rem color-mix(in oklab, var(--app-focus) 22%, transparent),
			0 0.34rem 0 color-mix(in oklab, black 30%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 14%, transparent);
	}

	.game-card[data-variant='answer'][data-redacted='true'] {
		filter: saturate(0.9);
	}

	.game-card[data-variant='clue'] {
		min-height: 11rem;
	}

	.game-card[data-variant='result'] {
		width: min(100%, 22rem);
		min-height: 12rem;
		margin: 0 auto;
	}

	.game-card[data-variant='result'][data-result='win'] {
		border-color: color-mix(in oklab, var(--app-focus) 58%, var(--app-border) 42%);
	}

	.game-card[data-voted='true'] .game-card-title {
		background: color-mix(in oklab, var(--app-focus) 14%, var(--app-input));
	}

	.game-card-title,
	.game-card-body {
		position: relative;
		z-index: 1;
	}

	.game-card-title {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 3.2rem;
		border-bottom: 1px solid color-mix(in oklab, var(--app-border) 76%, transparent);
		background: color-mix(in oklab, var(--app-input) 44%, transparent);
		font-size: 1.18rem;
		font-weight: 900;
		line-height: 1.08;
		overflow: hidden;
		padding: 0.7rem 0.85rem 0.62rem;
		text-align: center;
		text-shadow: 0 0.18rem 0.42rem color-mix(in oklab, black 34%, transparent);
		transform: translateZ(0.7rem);
	}

	.game-card[data-title-fancy='true'] .game-card-title {
		font-family: var(--font-fancy);
	}

	.game-card[data-fill-height='true'] .game-card-title {
		min-height: 2.25rem;
		font-size: 0.9rem;
		padding: 0.52rem 0.62rem 0.45rem;
	}

	.game-card[data-compact='true'] .game-card-title {
		min-height: 1.7rem;
		font-size: 0.72rem;
		padding: 0.34rem 0.5rem 0.3rem;
	}

	.game-card[data-variant='answer'] .game-card-title {
		min-height: clamp(3.2rem, 8dvh, 4.5rem);
		font-size: clamp(1.16rem, 4vw, 1.8rem);
	}

	.game-card-title-text {
		position: relative;
		z-index: 1;
		min-width: 0;
	}

	.game-card-title-addon {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		background: linear-gradient(
			90deg,
			transparent 0 24%,
			color-mix(in oklab, black 52%, transparent) 62%,
			color-mix(in oklab, black 76%, transparent)
		);
		padding: 0.25rem 0.55rem 0.25rem 42%;
		pointer-events: none;
		transform: translateZ(1rem);
		will-change: opacity;
	}

	.game-card-title-addon :global(.vote-stack) {
		justify-content: flex-end;
		width: auto;
		min-width: 0;
		height: auto;
	}

	.game-card-title-addon :global(.vote-ghost .avatar) {
		font-size: 1.22rem;
	}

	.game-card[data-compact='true'] .game-card-title-addon :global(.vote-ghost .avatar) {
		font-size: 1rem;
	}

	.game-card-body {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 7.15rem;
		flex: 1 1 0;
		color: color-mix(in oklab, var(--app-text) 88%, var(--app-muted) 12%);
		font-size: 1.06rem;
		font-weight: 650;
		line-height: 1.26;
		padding: 0.85rem 0.95rem;
		text-align: center;
		text-wrap: balance;
		transform: translateZ(0.45rem);
	}

	.game-card[data-fill-height='true'] .game-card-body {
		min-height: 0;
		font-size: 1.08rem;
		line-height: 1.22;
		padding: 0.7rem 0.85rem;
		overflow: hidden;
	}

	.game-card[data-compact='true'] .game-card-body {
		min-height: 0;
		font-size: 0.84rem;
		font-weight: 500;
		line-height: 1.18;
		padding: 0.52rem 0.62rem;
		overflow: hidden;
	}

	.game-card[data-variant='answer'] .game-card-body {
		min-height: clamp(6.8rem, 21dvh, 10.5rem);
		font-size: clamp(1.02rem, 2.8vw, 1.28rem);
		line-height: 1.24;
	}

	.game-card-body[data-fancy='true'],
	.game-card-body-fancy {
		font-family: var(--font-fancy);
		font-weight: 950;
		letter-spacing: 0;
		text-shadow:
			0 0 0.65rem color-mix(in oklab, var(--app-focus) 28%, transparent),
			0 0.2rem 0.42rem color-mix(in oklab, black 42%, transparent);
	}

	.game-card[data-variant='clue'] .game-card-body-fancy {
		font-size: clamp(1.4rem, 7vw, 2rem);
		line-height: 1;
	}

	.game-card[data-variant='result'] .game-card-body-fancy {
		color: var(--logo-word);
		font-size: clamp(1.6rem, 8vw, 2.35rem);
	}

	.game-card-footer {
		position: relative;
		z-index: 1;
		display: flex;
		justify-content: center;
		border-top: 1px solid color-mix(in oklab, var(--app-border) 64%, transparent);
		padding: 0.7rem;
		transform: translateZ(0.75rem);
	}

	@keyframes game-card-float {
		0%,
		100% {
			transform: translate3d(0, 0, 0) rotate(-0.25deg);
		}
		34% {
			transform: translate3d(0.12rem, -0.28rem, 0.35rem) rotate(0.45deg);
		}
		68% {
			transform: translate3d(-0.1rem, 0.16rem, 0.18rem) rotate(-0.55deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.game-card-shell[data-dancing='true'] {
			animation: none;
		}
	}
</style>
