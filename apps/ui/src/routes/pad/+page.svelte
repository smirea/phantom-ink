<script lang="ts">
	import InkButton from '$lib/InkButton.svelte';

	type Team = 'sun' | 'moon';

	const rows = [
		{ row: 1, sun: 'PAP', moon: 'PLAN', budget: 2, sunEye: false, moonEye: false },
		{ row: 2, sun: 'GOO', moon: 'WOR', budget: 2, sunEye: false, moonEye: false },
		{ row: 3, sun: 'S', moon: 'OFF', budget: 2, sunEye: false, moonEye: true },
		{ row: 4, sun: '', moon: '', budget: 3, sunEye: true, moonEye: false },
		{ row: 5, sun: '', moon: '', budget: 3, sunEye: false, moonEye: true },
		{ row: 6, sun: '', moon: '', budget: 4, sunEye: true, moonEye: true },
		{ row: 7, sun: '', moon: '', budget: 5, sunEye: true, moonEye: false },
		{ row: 8, sun: '', moon: '', budget: 5, sunEye: false, moonEye: false },
	];

	let activeTeam = $state<Team>('sun');
	let selectedRow = $state(4);

	const selected = $derived(rows.find(row => row.row === selectedRow) ?? rows[0]);
	const clueText = $derived(activeTeam === 'sun' ? selected.sun : selected.moon);

	function advance(): void {
		if (selectedRow < rows.length) {
			selectedRow += 1;
		} else {
			selectedRow = 1;
			activeTeam = activeTeam === 'sun' ? 'moon' : 'sun';
		}
	}
</script>

<svelte:head>
	<title>Pad | Phantom Ink</title>
</svelte:head>

<section class="mock-screen">
	<header class="screen-heading">
		<div>
			<p class="eyebrow">Spirit pad</p>
			<h1>Letters at the veil</h1>
		</div>
		<span class={`team-mark ${activeTeam}`}>{activeTeam}</span>
	</header>

	<div class="turn-card">
		<div>
			<span>Row {selected.row}</span>
			<strong>{clueText || 'Awaiting ink'}</strong>
		</div>
		<InkButton size="sm" primary onclick={advance}>Next</InkButton>
	</div>

	<div class="team-switch" aria-label="Active team">
		<button class:active={activeTeam === 'sun'} type="button" onclick={() => (activeTeam = 'sun')}>Sun</button>
		<button class:active={activeTeam === 'moon'} type="button" onclick={() => (activeTeam = 'moon')}>Moon</button>
	</div>

	<div class="pad-board">
		<div class="board-head sun">Sun</div>
		<div class="board-head">Round</div>
		<div class="board-head moon">Moon</div>
		{#each rows as row}
			<button
				class:active={selectedRow === row.row && activeTeam === 'sun'}
				class="pad-cell sun"
				type="button"
				onclick={() => {
					selectedRow = row.row;
					activeTeam = 'sun';
				}}
			>
				{#if row.sunEye}<span>Eye</span>{/if}
				<strong>{row.sun || `${row.budget} letters`}</strong>
			</button>
			<button
				class:active={selectedRow === row.row}
				class="round-cell"
				type="button"
				onclick={() => (selectedRow = row.row)}
			>
				{row.row}
			</button>
			<button
				class:active={selectedRow === row.row && activeTeam === 'moon'}
				class="pad-cell moon"
				type="button"
				onclick={() => {
					selectedRow = row.row;
					activeTeam = 'moon';
				}}
			>
				{#if row.moonEye}<span>Eye</span>{/if}
				<strong>{row.moon || `${row.budget} letters`}</strong>
			</button>
		{/each}
	</div>
</section>

<style>
	.mock-screen {
		display: grid;
		gap: 0.7rem;
	}

	.screen-heading,
	.turn-card {
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
		font-size: 1.5rem;
		line-height: 1.05;
	}

	.team-mark {
		border: 1px solid var(--app-border);
		border-radius: 999px;
		padding: 0.24rem 0.62rem;
		font-size: 0.75rem;
		font-weight: 900;
		text-transform: capitalize;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			color 180ms ease;
	}

	.team-mark.sun {
		border-color: var(--app-sun);
		color: var(--app-sun);
	}

	.team-mark.moon {
		border-color: var(--app-moon);
		color: var(--app-moon);
	}

	.turn-card {
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: var(--app-highlight);
		padding: 0.62rem;
	}

	.turn-card div {
		display: grid;
		gap: 0.18rem;
	}

	.turn-card span {
		color: var(--app-muted);
		font-size: 0.78rem;
		font-weight: 800;
	}

	.turn-card strong {
		font-size: 1.2rem;
		line-height: 1;
	}

	.team-switch {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem;
	}

	button {
		min-height: 2.3rem;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: var(--app-input);
		color: var(--app-text);
		font: inherit;
		font-weight: 800;
		cursor: pointer;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	button:hover {
		border-color: var(--app-accent);
		transform: translateY(-1px);
	}

	button.active {
		border-color: var(--app-accent);
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.pad-board {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 3.3rem minmax(0, 1fr);
		gap: 0.35rem;
	}

	.board-head,
	.round-cell {
		display: grid;
		place-items: center;
	}

	.board-head {
		min-height: 1.8rem;
		color: var(--app-muted);
		font-size: 0.74rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.board-head.sun {
		color: var(--app-sun);
	}

	.board-head.moon {
		color: var(--app-moon);
	}

	.pad-cell {
		display: grid;
		align-content: center;
		gap: 0.18rem;
		min-height: 2.68rem;
		padding: 0.28rem 0.45rem;
		text-align: left;
	}

	.pad-cell.sun {
		border-left: 0.3rem solid var(--app-sun);
	}

	.pad-cell.moon {
		border-left: 0.3rem solid var(--app-moon);
	}

	.pad-cell span {
		color: var(--app-muted);
		font-size: 0.65rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.pad-cell strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.round-cell {
		padding: 0;
	}
</style>
