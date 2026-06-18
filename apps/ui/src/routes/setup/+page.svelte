<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getAppContext } from '$lib/appContext';
	import InkButton from '$lib/InkButton.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import { playerColorPreset, playerIconComponents } from '$lib/playerPresentation';
	import {
		MAX_PLAYER_NAME_LENGTH,
		MIN_PLAYER_NAME_LENGTH,
		PLAYER_COLOR_PRESETS,
		PLAYER_ICON_PRESETS,
		isValidPlayerName,
		sanitizePlayerName,
		type PlayerColorId,
		type PlayerIconId,
	} from '@repo/shared/onlineGame';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Dices from '@lucide/svelte/icons/dices';
	import { sample } from 'es-toolkit';
	import { onMount } from 'svelte';

	const appContext = getAppContext();
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let tapTarget = $state<string | null>(null);
	let tapTimeout: ReturnType<typeof setTimeout> | undefined;
	let tapFrame: number | undefined;
	const selectedColor = $derived(playerColorPreset(appContext.user.color));
	const canSubmit = $derived(isValidPlayerName(appContext.user.name) && !isSubmitting);
	const returnPath = $derived(getReturnPath(page.url.searchParams.get('returnTo')));

	onMount(() => {
		return () => {
			if (tapFrame !== undefined) cancelAnimationFrame(tapFrame);
			if (tapTimeout) clearTimeout(tapTimeout);
		};
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		tapControl('continue');
		const name = sanitizePlayerName(appContext.user.name);
		if (!name) {
			error = `Name must be ${MIN_PLAYER_NAME_LENGTH}-${MAX_PLAYER_NAME_LENGTH} characters.`;
			return;
		}

		isSubmitting = true;
		error = null;
		try {
			appContext.user = {
				id: appContext.user.id,
				name,
				color: appContext.user.color,
				icon: appContext.user.icon,
			};
			await appContext.saveUser();
			await goto(returnPath, { noScroll: true });
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to save soul.';
		} finally {
			isSubmitting = false;
		}
	}

	function randomizeIdentity() {
		tapControl('dice');
		applyRandomIdentity();
	}

	function applyRandomIdentity() {
		appContext.user.color = sample(PLAYER_COLOR_PRESETS).id;
		appContext.user.icon = sample(PLAYER_ICON_PRESETS).id;
	}

	function selectIcon(nextIcon: PlayerIconId) {
		appContext.user.icon = nextIcon;
		tapControl(`icon:${nextIcon}`);
	}

	function selectColor(nextColor: PlayerColorId) {
		appContext.user.color = nextColor;
		tapControl(`color:${nextColor}`);
	}

	function tapControl(target: string) {
		if (tapFrame !== undefined) cancelAnimationFrame(tapFrame);
		if (tapTimeout) clearTimeout(tapTimeout);
		tapTarget = null;
		tapFrame = requestAnimationFrame(() => {
			tapFrame = undefined;
			tapTarget = target;
			tapTimeout = setTimeout(() => {
				if (tapTarget === target) tapTarget = null;
			}, 420);
		});
	}

	function getReturnPath(value: string | null): string {
		if (!value || !value.startsWith('/') || value.startsWith('//')) return '/lobby';

		try {
			const url = new URL(value, 'http://phantom-ink.localhost');
			if (url.pathname === '/' || url.pathname.startsWith('/setup')) return '/lobby';
			return `${url.pathname}${url.search}${url.hash}`;
		} catch {
			return '/lobby';
		}
	}
</script>

<svelte:head>
	<title>Setup | Phantom Ink</title>
</svelte:head>

<section class="setup-screen" style={`--selected-color: ${selectedColor.value}`}>
	<div class="setup-logo">
		<PhantomLogo compact textOnly />
	</div>

	<div class="icon-picker" aria-label="Choose icon">
		{#each PLAYER_ICON_PRESETS as preset}
			{@const Icon = playerIconComponents[preset.id]}
			<button
				aria-label={preset.label}
				aria-pressed={appContext.user.icon === preset.id}
				class:selected={appContext.user.icon === preset.id}
				class:tapped={tapTarget === `icon:${preset.id}`}
				disabled={isSubmitting}
				onclick={() => selectIcon(preset.id)}
				title={preset.label}
				type="button"
			>
				<Icon size={30} strokeWidth={1.8} />
			</button>
		{/each}
	</div>

	<form class="setup-form" onsubmit={submit}>
		<InkButton
			aria-label="Random icon and color"
			class={`dice-button ${tapTarget === 'dice' ? 'tapped' : ''}`}
			disabled={isSubmitting}
			ghost
			icon={Dices}
			iconSize={28}
			iconStrokeWidth={1.9}
			onclick={randomizeIdentity}
			title="Random icon and color"
			type="button"
		/>

		<label class="name-label">
			<span class="visually-hidden">Name</span>
			<input
				autocomplete="nickname"
				autofocus
				disabled={isSubmitting}
				maxlength={MAX_PLAYER_NAME_LENGTH}
				minlength={MIN_PLAYER_NAME_LENGTH}
				placeholder="Who are you?"
				spellcheck="false"
				type="text"
				bind:value={appContext.user.name}
			/>
		</label>

		<InkButton
			aria-label="Continue to lobby"
			class={`continue-button ${tapTarget === 'continue' ? 'tapped' : ''}`}
			disabled={!canSubmit}
			icon={ArrowRight}
			iconSize={34}
			iconStrokeWidth={2.2}
			primary
			title="Continue to lobby"
			type="submit"
		/>
	</form>

	<div class="color-picker" aria-label="Choose color">
		{#each PLAYER_COLOR_PRESETS as preset}
			<button
				aria-label={preset.label}
				aria-pressed={appContext.user.color === preset.id}
				class:selected={appContext.user.color === preset.id}
				class:tapped={tapTarget === `color:${preset.id}`}
				disabled={isSubmitting}
				onclick={() => selectColor(preset.id)}
				style={`--swatch: ${preset.value}`}
				title={preset.label}
				type="button"
			></button>
		{/each}
	</div>

	{#if error}
		<p class="setup-error">{error}</p>
	{/if}
</section>

<style>
	.setup-screen {
		--picker-gap: clamp(0.38rem, 1.5vw, 0.55rem);
		--picker-size: clamp(2.45rem, 10.8vw, 3.5rem);
		position: relative;
		z-index: 1;
		display: grid;
		justify-items: center;
		gap: clamp(0.9rem, 2.6vw, 1.35rem);
		width: min(100%, 36rem);
		padding: 1rem;
	}

	.setup-logo {
		display: flex;
		justify-content: center;
		width: 100%;
		margin-bottom: clamp(0.1rem, 1.2vw, 0.4rem);
		filter: drop-shadow(0 0.8rem 1.4rem color-mix(in oklab, black 34%, transparent));
	}

	.setup-logo :global(.phantom-logo) {
		width: fit-content;
		max-width: 100%;
	}

	.icon-picker {
		display: grid;
		grid-template-columns: repeat(6, var(--picker-size));
		justify-content: center;
		gap: var(--picker-gap);
		width: min(100%, calc(var(--picker-size) * 6 + var(--picker-gap) * 5));
	}

	.icon-picker button,
	.color-picker button {
		display: inline-grid;
		place-items: center;
		position: relative;
		width: var(--picker-size);
		height: var(--picker-size);
		border: 1px solid color-mix(in oklab, var(--app-border) 70%, transparent);
		background: color-mix(in oklab, var(--app-panel) 62%, transparent);
		color: var(--app-muted);
		cursor: pointer;
		overflow: visible;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			box-shadow 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	.icon-picker button::after,
	.color-picker button::after {
		position: absolute;
		inset: -0.28rem;
		border: 1px solid currentColor;
		border-radius: inherit;
		opacity: 0;
		pointer-events: none;
		content: '';
	}

	.icon-picker button {
		border-radius: 999px;
	}

	.icon-picker button:hover {
		color: var(--app-text);
		transform: translateY(-2px);
	}

	.icon-picker button:not(:disabled):active,
	.color-picker button:not(:disabled):active {
		transform: translateY(1px) scale(0.94);
	}

	.icon-picker button.tapped,
	.color-picker button.tapped {
		animation: setup-control-tap 420ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.icon-picker button.tapped::after,
	.color-picker button.tapped::after {
		animation: setup-control-ring 420ms ease-out;
	}

	.icon-picker button.selected {
		border-color: var(--selected-color);
		background: color-mix(in oklab, var(--selected-color) 16%, var(--app-panel));
		box-shadow: 0 0 1.1rem color-mix(in oklab, var(--selected-color) 28%, transparent);
		color: var(--selected-color);
	}

	.setup-form {
		display: grid;
		grid-template-columns: var(--picker-size) minmax(0, 1fr) var(--picker-size);
		align-items: center;
		gap: var(--picker-gap);
		width: min(100%, 34rem);
	}

	:global(.setup-form .ink-button.dice-button),
	:global(.setup-form .ink-button.continue-button) {
		width: var(--picker-size);
		height: var(--picker-size);
		min-height: 0;
		padding: 0;
		border-radius: 0.5rem;
	}

	.name-label {
		min-width: 0;
	}

	input {
		width: 100%;
		min-height: 4rem;
		border: 1px solid color-mix(in oklab, var(--selected-color) 58%, var(--app-border));
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--app-input) 72%, transparent);
		box-shadow:
			0 1rem 2.4rem color-mix(in oklab, black 28%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 6%, transparent);
		color: var(--app-text);
		font: inherit;
		font-size: clamp(1.35rem, 6.8vw, 2.35rem);
		font-weight: 900;
		letter-spacing: 0;
		line-height: 1;
		padding: 0.35rem 1rem 0.45rem;
		text-align: center;
		text-transform: uppercase;
	}

	input::placeholder {
		color: color-mix(in oklab, var(--app-muted) 68%, transparent);
		font-size: clamp(1.15rem, 5.6vw, 1.95rem);
		text-transform: none;
	}

	input:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--app-focus);
		outline-offset: 4px;
	}

	:global(.setup-form .ink-button.primary.continue-button:hover:not(:disabled)) {
		transform: translateX(2px);
	}

	:global(.setup-form .ink-button.primary.continue-button:hover:not(:disabled) .ink-button-icon) {
		transform: translateX(2px);
	}

	button:disabled,
	input:disabled {
		cursor: default;
		opacity: 0.58;
	}

	.color-picker {
		display: grid;
		grid-template-columns: repeat(6, var(--picker-size));
		justify-content: center;
		gap: var(--picker-gap);
		width: min(100%, calc(var(--picker-size) * 6 + var(--picker-gap) * 5));
	}

	.color-picker button {
		border-radius: 999px;
		background:
			radial-gradient(circle at 32% 26%, color-mix(in oklab, var(--swatch) 84%, white), var(--swatch) 58%),
			var(--swatch);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, white 16%, transparent),
			0 0.55rem 1.1rem color-mix(in oklab, black 24%, transparent);
	}

	.color-picker button::before {
		position: absolute;
		inset: -0.18rem;
		border: 1px solid color-mix(in oklab, var(--swatch) 78%, white 22%);
		border-radius: inherit;
		opacity: 0;
		pointer-events: none;
		content: '';
	}

	.color-picker button:hover:not(:disabled) {
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, white 20%, transparent),
			0 0.7rem 1.25rem color-mix(in oklab, black 28%, transparent),
			0 0 1rem color-mix(in oklab, var(--swatch) 24%, transparent);
		transform: translateY(-2px);
	}

	.color-picker button:hover:not(:disabled)::before {
		animation: setup-swatch-ripple 1250ms ease-out infinite;
	}

	.color-picker button.selected {
		border-color: var(--app-focus);
		box-shadow:
			0 0 0 0.18rem color-mix(in oklab, var(--app-bg) 88%, transparent),
			0 0 0 0.35rem var(--swatch),
			0 0.8rem 1.3rem color-mix(in oklab, var(--swatch) 25%, transparent);
		transform: translateY(-2px);
	}

	.setup-error {
		min-height: 1.25rem;
		margin: 0;
		color: var(--app-error);
		font-size: 0.9rem;
		font-weight: 800;
		text-align: center;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		clip: rect(0 0 0 0);
		overflow: hidden;
		white-space: nowrap;
	}

	@keyframes setup-control-tap {
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

	@keyframes setup-control-ring {
		0% {
			opacity: 0.5;
			transform: scale(0.76);
		}

		100% {
			opacity: 0;
			transform: scale(1.34);
		}
	}

	@keyframes setup-swatch-ripple {
		0% {
			opacity: 0.58;
			transform: scale(0.72);
		}

		68%,
		100% {
			opacity: 0;
			transform: scale(1.55);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.color-picker button:hover:not(:disabled)::before {
			animation: none;
		}
	}

	@media (max-width: 460px) {
		.setup-form {
			gap: 0.45rem;
		}

		input {
			min-height: 3.55rem;
			padding-inline: 0.65rem;
		}
	}
</style>
