<script lang="ts">
	import InkButton from '$lib/InkButton.svelte';

	const questions = [
		{ prompt: 'What material holds it?', category: 'Material', clue: 'PAP' },
		{ prompt: 'Where would it wait?', category: 'Place', clue: 'DES' },
		{ prompt: 'What mood follows it?', category: 'Feeling', clue: 'QUI' },
	];

	let selected = $state(0);
	let revealed = $state(3);
	const active = $derived(questions[selected]);
	const clue = $derived(active.clue.slice(0, revealed));

	function selectQuestion(index: number): void {
		selected = index;
		revealed = 1;
	}

	function addLetter(): void {
		revealed = Math.min(active.clue.length, revealed + 1);
	}
</script>

<svelte:head>
	<title>Whispers | Phantom Ink</title>
</svelte:head>

<section class="mock-screen">
	<header class="screen-heading">
		<div>
			<p class="eyebrow">Question cards</p>
			<h1>Ask beyond the table</h1>
		</div>
		<span class="count">{revealed}/{active.clue.length}</span>
	</header>

	<div class="question-stack">
		{#each questions as question, index}
			<button class:active={selected === index} type="button" onclick={() => selectQuestion(index)}>
				<span>{question.category}</span>
				<strong>{question.prompt}</strong>
			</button>
		{/each}
	</div>

	<div class="clue-panel">
		<p>Spirit answer</p>
		<div class="clue-letters" aria-label="Revealed clue">
			{#key clue}
				{#each clue.split('') as letter}
					<span>{letter}</span>
				{/each}
			{/key}
		</div>
		<div class="action-row">
			<InkButton primary onclick={addLetter} disabled={revealed >= active.clue.length}>Reveal</InkButton>
			<InkButton onclick={() => (revealed = 1)}>Silencio</InkButton>
		</div>
	</div>

	<div class="table-state">
		<div>
			<span>Sun clue</span>
			<strong>PAP</strong>
		</div>
		<div>
			<span>Moon clue</span>
			<strong>WOR</strong>
		</div>
		<div>
			<span>Object</span>
			<strong>Hidden</strong>
		</div>
	</div>
</section>

<style>
	.mock-screen {
		display: grid;
		gap: 0.85rem;
	}

	.screen-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
	}

	.eyebrow,
	p,
	h1 {
		margin: 0;
	}

	.eyebrow {
		color: var(--app-muted);
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	h1 {
		font-size: 1.65rem;
		line-height: 1.05;
	}

	.count {
		border: 1px solid var(--app-border);
		border-radius: 999px;
		background: var(--app-chip);
		color: var(--app-chip-text);
		padding: 0.22rem 0.62rem;
		font-size: 0.75rem;
		font-weight: 900;
	}

	.question-stack {
		display: grid;
		gap: 0.5rem;
	}

	.question-stack button {
		display: grid;
		gap: 0.22rem;
		min-height: 4.4rem;
		border: 1px solid var(--app-border);
		border-left: 0.3rem solid var(--app-accent);
		border-radius: 0.5rem;
		background: var(--app-input);
		color: var(--app-text);
		padding: 0.65rem;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			box-shadow 220ms ease,
			transform 180ms ease;
	}

	.question-stack button:hover {
		border-color: var(--app-accent);
		box-shadow: 0 0.5rem 1.2rem color-mix(in oklab, var(--app-accent) 15%, transparent);
		transform: translateY(-1px);
	}

	.question-stack button.active {
		background: var(--app-highlight);
	}

	.question-stack span,
	.clue-panel p,
	.table-state span {
		color: var(--app-muted);
		font-size: 0.74rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.question-stack strong {
		line-height: 1.2;
	}

	.clue-panel {
		display: grid;
		gap: 0.8rem;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: var(--app-highlight);
		padding: 0.8rem;
	}

	.clue-letters {
		display: flex;
		gap: 0.35rem;
		min-height: 3.2rem;
	}

	.clue-letters span {
		display: grid;
		place-items: center;
		width: 2.5rem;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: var(--app-panel);
		color: var(--app-text);
		font-size: 1.45rem;
		font-weight: 900;
		animation: letter-rise 260ms ease both;
	}

	.action-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.table-state {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.table-state div {
		display: grid;
		gap: 0.25rem;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: var(--app-input);
		padding: 0.6rem;
	}

	.table-state strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@keyframes letter-rise {
		from {
			opacity: 0;
			transform: translateY(0.5rem) rotate(-3deg);
		}

		to {
			opacity: 1;
			transform: translateY(0) rotate(0);
		}
	}
</style>
