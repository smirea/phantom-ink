<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ensureUser, loadStoredUser } from '$lib/api';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import { playerColorPreset, playerIconComponents } from '$lib/playerPresentation';
	import { LS, storageKeys } from '$lib/storage';
	import {
		DEFAULT_PLAYER_COLOR,
		DEFAULT_PLAYER_ICON,
		MAX_PLAYER_NAME_LENGTH,
		MIN_PLAYER_NAME_LENGTH,
		PLAYER_COLOR_PRESETS,
		PLAYER_ICON_PRESETS,
		isCompleteUserProfile,
		isValidPlayerName,
		type PlayerColorId,
		type PlayerIconId,
	} from '@repo/shared/onlineGame';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Dices from '@lucide/svelte/icons/dices';
	import { onMount } from 'svelte';

	let name = $state(LS.get(storageKeys.playerName) ?? '');
	let color = $state<PlayerColorId>(LS.get(storageKeys.playerColor, DEFAULT_PLAYER_COLOR));
	let icon = $state<PlayerIconId>(LS.get(storageKeys.playerIcon, DEFAULT_PLAYER_ICON));
	let isLoading = $state(true);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let tapTarget = $state<string | null>(null);
	let tapTimeout: ReturnType<typeof setTimeout> | undefined;
	let tapFrame: number | undefined;
	const selectedColor = $derived(playerColorPreset(color));
	const canSubmit = $derived(isValidPlayerName(name) && !isLoading && !isSubmitting);
	const returnPath = $derived(getReturnPath(page.url.searchParams.get('returnTo')));

	onMount(() => {
		void loadProfile();
		return () => {
			if (tapFrame !== undefined) cancelAnimationFrame(tapFrame);
			if (tapTimeout) clearTimeout(tapTimeout);
		};
	});

	async function loadProfile() {
		isLoading = true;
		error = null;
		try {
			const user = await loadStoredUser();
			if (isCompleteUserProfile(user)) {
				name = user.name;
				color = user.color;
				icon = user.icon;
			}
		} catch {
			error = null;
		} finally {
			isLoading = false;
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		tapControl('continue');
		if (!isValidPlayerName(name)) {
			error = `Name must be ${MIN_PLAYER_NAME_LENGTH}-${MAX_PLAYER_NAME_LENGTH} characters.`;
			return;
		}

		isSubmitting = true;
		error = null;
		try {
			await ensureUser({ name, color, icon });
			await goto(returnPath, { noScroll: true });
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to save soul.';
		} finally {
			isSubmitting = false;
		}
	}

	function randomizeIdentity() {
		tapControl('dice');
		color = randomPreset(PLAYER_COLOR_PRESETS).id;
		icon = randomPreset(PLAYER_ICON_PRESETS).id;
	}

	function selectIcon(nextIcon: PlayerIconId) {
		icon = nextIcon;
		tapControl(`icon:${nextIcon}`);
	}

	function selectColor(nextColor: PlayerColorId) {
		color = nextColor;
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

	function randomPreset<T>(items: readonly T[]): T {
		return items[Math.floor(Math.random() * items.length)] ?? items[0];
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
				aria-pressed={icon === preset.id}
				class:selected={icon === preset.id}
				class:tapped={tapTarget === `icon:${preset.id}`}
				disabled={isLoading || isSubmitting}
				onclick={() => selectIcon(preset.id)}
				title={preset.label}
				type="button"
			>
				<Icon size={30} strokeWidth={1.8} />
			</button>
		{/each}
	</div>

	<form class="setup-form" onsubmit={submit}>
		<button
			aria-label="Random icon and color"
			class:tapped={tapTarget === 'dice'}
			class="dice-button"
			disabled={isLoading || isSubmitting}
			onclick={randomizeIdentity}
			title="Random icon and color"
			type="button"
		>
			<Dices size={28} strokeWidth={1.9} />
		</button>

		<label class="name-label">
			<span class="visually-hidden">Name</span>
			<input
				autocomplete="nickname"
				autofocus
				disabled={isLoading || isSubmitting}
				maxlength={MAX_PLAYER_NAME_LENGTH}
				minlength={MIN_PLAYER_NAME_LENGTH}
				placeholder="Who are you?"
				spellcheck="false"
				type="text"
				bind:value={name}
			/>
		</label>

		<button
			aria-label="Continue to lobby"
			class:tapped={tapTarget === 'continue'}
			class="continue-button"
			disabled={!canSubmit}
			title="Continue to lobby"
			type="submit"
		>
			<ArrowRight size={34} strokeWidth={2.2} />
		</button>
	</form>

	<div class="color-picker" aria-label="Choose color">
		{#each PLAYER_COLOR_PRESETS as preset}
			<button
				aria-label={preset.label}
				aria-pressed={color === preset.id}
				class:selected={color === preset.id}
				class:tapped={tapTarget === `color:${preset.id}`}
				disabled={isLoading || isSubmitting}
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
	.color-picker button,
	.dice-button,
	.continue-button {
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
	.color-picker button::after,
	.dice-button::after,
	.continue-button::after {
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

	.icon-picker button:hover,
	.dice-button:hover {
		color: var(--app-text);
		transform: translateY(-2px);
	}

	.icon-picker button:not(:disabled):active,
	.color-picker button:not(:disabled):active,
	.dice-button:not(:disabled):active,
	.continue-button:not(:disabled):active {
		transform: translateY(1px) scale(0.94);
	}

	.icon-picker button.tapped,
	.color-picker button.tapped,
	.dice-button.tapped,
	.continue-button.tapped {
		animation: setup-control-tap 420ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.icon-picker button.tapped::after,
	.color-picker button.tapped::after,
	.dice-button.tapped::after,
	.continue-button.tapped::after {
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

	.dice-button,
	.continue-button {
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

	.continue-button {
		border-color: var(--app-accent-strong);
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-accent) 84%, white 16%), var(--app-accent)),
			var(--app-accent);
		box-shadow:
			0 0.9rem 2rem color-mix(in oklab, var(--app-accent) 28%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 18%, transparent);
		color: var(--app-accent-ink);
	}

	.continue-button:hover:not(:disabled) {
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
