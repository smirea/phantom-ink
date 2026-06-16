<script lang="ts">
	import { goto } from '$app/navigation';
	import { ensureUser, loadStoredUser } from '$lib/api';
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
	import Angry from '@lucide/svelte/icons/angry';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Bug from '@lucide/svelte/icons/bug';
	import Cat from '@lucide/svelte/icons/cat';
	import Dices from '@lucide/svelte/icons/dices';
	import Drama from '@lucide/svelte/icons/drama';
	import Fish from '@lucide/svelte/icons/fish';
	import Ghost from '@lucide/svelte/icons/ghost';
	import Rabbit from '@lucide/svelte/icons/rabbit';
	import Rat from '@lucide/svelte/icons/rat';
	import Skull from '@lucide/svelte/icons/skull';
	import Snail from '@lucide/svelte/icons/snail';
	import VenetianMask from '@lucide/svelte/icons/venetian-mask';
	import Worm from '@lucide/svelte/icons/worm';
	import { onMount } from 'svelte';

	const iconComponents = {
		ghost: Ghost,
		skull: Skull,
		'venetian-mask': VenetianMask,
		drama: Drama,
		cat: Cat,
		rabbit: Rabbit,
		rat: Rat,
		snail: Snail,
		bug: Bug,
		worm: Worm,
		fish: Fish,
		angry: Angry,
	};

	let name = $state(LS.get(storageKeys.playerName) ?? '');
	let color = $state<PlayerColorId>(LS.get(storageKeys.playerColor, DEFAULT_PLAYER_COLOR));
	let icon = $state<PlayerIconId>(LS.get(storageKeys.playerIcon, DEFAULT_PLAYER_ICON));
	let isLoading = $state(true);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	const selectedColor = $derived(PLAYER_COLOR_PRESETS.find(preset => preset.id === color) ?? PLAYER_COLOR_PRESETS[0]);
	const canSubmit = $derived(isValidPlayerName(name) && !isLoading && !isSubmitting);

	onMount(() => {
		void loadProfile();
	});

	async function loadProfile() {
		isLoading = true;
		error = null;
		try {
			const user = await loadStoredUser();
			if (isCompleteUserProfile(user)) {
				await goto('/lobby', { noScroll: true });
				return;
			}
		} catch {
			error = null;
		} finally {
			isLoading = false;
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!isValidPlayerName(name)) {
			error = `Name must be ${MIN_PLAYER_NAME_LENGTH}-${MAX_PLAYER_NAME_LENGTH} characters.`;
			return;
		}

		isSubmitting = true;
		error = null;
		try {
			await ensureUser({ name, color, icon });
			await goto('/lobby', { noScroll: true });
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to save player.';
		} finally {
			isSubmitting = false;
		}
	}

	function randomizeIdentity() {
		color = randomPreset(PLAYER_COLOR_PRESETS).id;
		icon = randomPreset(PLAYER_ICON_PRESETS).id;
	}

	function randomPreset<T>(items: readonly T[]): T {
		return items[Math.floor(Math.random() * items.length)] ?? items[0];
	}
</script>

<svelte:head>
	<title>Setup | Phantom Ink</title>
</svelte:head>

<section class="setup-screen" style={`--selected-color: ${selectedColor.value}`}>
	<div class="icon-picker" aria-label="Choose icon">
		{#each PLAYER_ICON_PRESETS as preset}
			{@const Icon = iconComponents[preset.id]}
			<button
				aria-label={preset.label}
				aria-pressed={icon === preset.id}
				class:selected={icon === preset.id}
				disabled={isLoading || isSubmitting}
				onclick={() => (icon = preset.id)}
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
				placeholder="Name"
				spellcheck="false"
				type="text"
				bind:value={name}
			/>
		</label>

		<button
			aria-label="Continue to lobby"
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
				disabled={isLoading || isSubmitting}
				onclick={() => (color = preset.id)}
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
		position: relative;
		z-index: 1;
		display: grid;
		justify-items: center;
		gap: clamp(1rem, 3vw, 1.45rem);
		width: min(100%, 35rem);
		padding: 1rem;
	}

	.icon-picker {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.55rem;
		width: min(100%, 25rem);
	}

	.icon-picker button,
	.color-picker button,
	.dice-button,
	.continue-button {
		display: inline-grid;
		place-items: center;
		border: 1px solid color-mix(in oklab, var(--app-border) 70%, transparent);
		background: color-mix(in oklab, var(--app-panel) 62%, transparent);
		color: var(--app-muted);
		cursor: pointer;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			box-shadow 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	.icon-picker button {
		aspect-ratio: 1;
		border-radius: 999px;
	}

	.icon-picker button:hover,
	.dice-button:hover {
		color: var(--app-text);
		transform: translateY(-2px);
	}

	.icon-picker button.selected {
		border-color: var(--selected-color);
		background: color-mix(in oklab, var(--selected-color) 16%, var(--app-panel));
		box-shadow: 0 0 1.1rem color-mix(in oklab, var(--selected-color) 28%, transparent);
		color: var(--selected-color);
	}

	.setup-form {
		display: grid;
		grid-template-columns: 3.4rem minmax(0, 1fr) 3.8rem;
		align-items: center;
		gap: 0.65rem;
		width: min(100%, 34rem);
	}

	.dice-button,
	.continue-button {
		aspect-ratio: 1;
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
		font-size: clamp(1.65rem, 8vw, 2.45rem);
		font-weight: 900;
		letter-spacing: 0;
		line-height: 1;
		padding: 0.35rem 1rem 0.45rem;
		text-align: center;
		text-transform: uppercase;
	}

	input::placeholder {
		color: color-mix(in oklab, var(--app-muted) 68%, transparent);
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
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 0.38rem;
		width: min(100%, 28rem);
	}

	.color-picker button {
		aspect-ratio: 1;
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

	@media (max-width: 460px) {
		.icon-picker {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			width: min(100%, 18rem);
		}

		.setup-form {
			grid-template-columns: 3rem minmax(0, 1fr) 3.25rem;
			gap: 0.45rem;
		}

		input {
			min-height: 3.55rem;
			padding-inline: 0.65rem;
		}

		.color-picker {
			grid-template-columns: repeat(6, minmax(0, 1fr));
			width: min(100%, 16rem);
		}
	}
</style>
