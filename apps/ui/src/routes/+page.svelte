<script lang="ts">
	import PhantomLogo from '$lib/PhantomLogo.svelte';
</script>

<svelte:head>
	<title>Phantom Ink</title>
</svelte:head>

<section class="start-screen">
	<PhantomLogo />
	<a class="start-button" href="/lobby">Start</a>
</section>

<style>
	.start-screen {
		position: relative;
		z-index: 1;
		display: grid;
		justify-items: center;
		gap: clamp(1.6rem, 5vw, 2.8rem);
		width: min(100%, 32rem);
		padding: 1rem;
	}

	.start-screen :global(.phantom-logo) {
		width: min(100%, 31rem);
		filter: drop-shadow(0 1.2rem 2rem color-mix(in oklab, black 38%, transparent));
	}

	.start-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: min(100%, 14rem);
		min-height: 3.6rem;
		border: 1px solid var(--app-accent-strong);
		border-radius: 0.5rem;
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-accent) 86%, white 14%), var(--app-accent)),
			var(--app-accent);
		box-shadow:
			0 0.9rem 2rem color-mix(in oklab, var(--app-accent) 28%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 18%, transparent);
		color: var(--app-accent-ink);
		font-size: 1.25rem;
		font-weight: 900;
		line-height: 1;
		text-decoration: none;
		transition:
			box-shadow 220ms ease,
			transform 180ms ease;
	}

	.start-button:hover {
		box-shadow:
			0 1.15rem 2.3rem color-mix(in oklab, var(--app-accent) 34%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 22%, transparent);
		transform: translateY(-2px);
	}

	.start-button:active {
		transform: translateY(1px) scale(0.99);
	}

	.start-button:focus-visible {
		outline: 2px solid var(--app-focus);
		outline-offset: 4px;
	}
</style>
