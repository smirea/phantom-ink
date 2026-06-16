<script lang="ts">
	import PlayerAvatar from '$lib/PlayerAvatar.svelte';
	import { getRoomDirectory, joinRoom } from '$lib/api';
	import { createRoomCode } from '$lib/roomCodes';
	import { LS, storageKeys } from '$lib/storage';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PLAYER_COLOR_PRESETS, type PlayerColorId, type RoomDirectoryListing } from '@repo/shared/onlineGame';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Plus from '@lucide/svelte/icons/plus';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import { onMount } from 'svelte';

	let rooms = $state<RoomDirectoryListing[]>([]);
	let expandedRooms = $state<Set<string>>(new Set());
	let isLoading = $state(true);
	let isCreating = $state(false);
	let joiningCode = $state<string | null>(null);
	let error = $state<string | null>(null);

	onMount(() => {
		let cancelled = false;

		async function load() {
			try {
				const nextRooms = await getRoomDirectory();
				if (!cancelled) {
					rooms = nextRooms;
					error = null;
				}
			} catch {
				if (!cancelled) error = 'Unable to load open séances.';
			} finally {
				if (!cancelled) isLoading = false;
			}
		}

		void load();
		const interval = window.setInterval(() => void load(), 2500);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	});

	async function startNewSeance() {
		if (isCreating) return;
		isCreating = true;
		error = null;
		try {
			await joinAndNavigate(createUnusedRoomCode());
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to start a séance.';
		} finally {
			isCreating = false;
		}
	}

	async function joinExistingRoom(code: string) {
		if (joiningCode || isCreating) return;
		error = null;
		try {
			await joinAndNavigate(code);
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to join séance.';
		}
	}

	async function joinAndNavigate(code: string) {
		joiningCode = code;
		try {
			await joinRoom(code, LS.get(storageKeys.playerName) ?? '');
			await goto(roomHref(code), { noScroll: true });
		} finally {
			joiningCode = null;
		}
	}

	function createUnusedRoomCode(): string {
		const usedCodes = new Set(rooms.map(room => room.code));
		for (let attempt = 0; attempt < 16; attempt += 1) {
			const code = createRoomCode();
			if (!usedCodes.has(code)) return code;
		}
		return createRoomCode();
	}

	function roomHref(code: string): string {
		return `/room/${code}${page.url.search}${page.url.hash}`;
	}

	function colorValue(color: PlayerColorId): string {
		return PLAYER_COLOR_PRESETS.find(preset => preset.id === color)?.value ?? PLAYER_COLOR_PRESETS[0].value;
	}

	function isExpanded(code: string): boolean {
		return expandedRooms.has(code);
	}

	function toggleExpanded(event: MouseEvent, code: string) {
		event.stopPropagation();
		const next = new Set(expandedRooms);
		if (next.has(code)) next.delete(code);
		else next.add(code);
		expandedRooms = next;
	}

	function handleRoomKeydown(event: KeyboardEvent, code: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		void joinExistingRoom(code);
	}
</script>

<svelte:head>
	<title>Lobby | Phantom Ink</title>
</svelte:head>

<section class="lobby-screen">
	<button
		class="new-seance-button"
		disabled={isCreating || Boolean(joiningCode)}
		onclick={startNewSeance}
		type="button"
	>
		{#if isCreating}
			<LoaderCircle class="spin" size={24} strokeWidth={2.4} />
		{:else}
			<Plus size={26} strokeWidth={2.5} />
		{/if}
		<span>Start a new séance</span>
	</button>

	<div class="lobby-list" aria-live="polite">
		{#if rooms.length}
			{#each rooms as room (room.code)}
				{@const expanded = isExpanded(room.code)}
				<div
					aria-label={`Join séance ${room.code}`}
					class:joining={joiningCode === room.code}
					class="lobby-row"
					onclick={() => joinExistingRoom(room.code)}
					onkeydown={event => handleRoomKeydown(event, room.code)}
					role="button"
					tabindex="0"
				>
					<button
						aria-expanded={expanded}
						aria-label={`${expanded ? 'Collapse' : 'Expand'} ${room.code} players`}
						class="expand-button"
						onclick={event => toggleExpanded(event, room.code)}
						type="button"
					>
						<ChevronDown size={21} strokeWidth={2.5} />
					</button>

					<div class="lobby-row-meta">
						<div class="room-code">{room.code}</div>
						<div class="player-count">
							<UsersRound size={16} strokeWidth={2.2} />
							<span>{room.playerCount} {room.playerCount === 1 ? 'player' : 'players'}</span>
						</div>
					</div>

					<div class:expanded class:truncated={!expanded && room.players.length > 4} class="player-list">
						{#each room.players as player (player.id)}
							<span class="player-pill">
								<PlayerAvatar color={colorValue(player.color)} icon={player.icon} label={`${player.name} avatar`} />
								<span>{player.name}</span>
							</span>
						{/each}
					</div>

					<div class="join-arrow" aria-hidden="true">
						{#if joiningCode === room.code}
							<LoaderCircle class="spin" size={22} strokeWidth={2.4} />
						{:else}
							<ArrowUpRight size={24} strokeWidth={2.5} />
						{/if}
					</div>
				</div>
			{/each}
		{:else if isLoading}
			<div class="empty-lobby">Looking for open séances...</div>
		{:else}
			<div class="empty-lobby">No open séances yet.</div>
		{/if}
	</div>

	{#if error}
		<p class="lobby-error">{error}</p>
	{/if}
</section>

<style>
	.lobby-screen {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	.new-seance-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		min-height: 4rem;
		border: 1px solid var(--app-accent-strong);
		border-radius: 0.5rem;
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-accent) 86%, white 14%), var(--app-accent)),
			var(--app-accent);
		box-shadow:
			0 0.9rem 2rem color-mix(in oklab, var(--app-accent) 26%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 18%, transparent);
		color: var(--app-accent-ink);
		cursor: pointer;
		font: inherit;
		font-size: clamp(1.1rem, 4.8vw, 1.45rem);
		font-weight: 950;
		letter-spacing: 0;
		line-height: 1;
		padding: 0.85rem 1rem;
		transition:
			box-shadow 200ms ease,
			filter 200ms ease,
			transform 180ms ease;
	}

	.new-seance-button:hover:not(:disabled) {
		box-shadow:
			0 1.15rem 2.4rem color-mix(in oklab, var(--app-accent) 32%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 22%, transparent);
		transform: translateY(-2px);
	}

	.new-seance-button:active:not(:disabled) {
		transform: translateY(1px) scale(0.985);
	}

	.new-seance-button:disabled {
		cursor: default;
		opacity: 0.72;
	}

	.lobby-list {
		display: grid;
		gap: 0.65rem;
		min-width: 0;
	}

	.lobby-row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(5.6rem, auto) minmax(0, 1fr) auto;
		gap: 0.6rem;
		align-items: start;
		min-width: 0;
		border: 1px solid color-mix(in oklab, var(--app-border) 78%, transparent);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--app-input) 68%, transparent);
		box-shadow:
			0 0.7rem 1.6rem color-mix(in oklab, black 20%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 5%, transparent);
		cursor: pointer;
		padding: 0.82rem 3rem 0.82rem 0.82rem;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			box-shadow 180ms ease,
			transform 180ms ease;
	}

	.lobby-row:hover,
	.lobby-row:focus-visible {
		border-color: color-mix(in oklab, var(--app-accent) 58%, var(--app-border));
		background: color-mix(in oklab, var(--app-highlight) 56%, var(--app-input));
		box-shadow:
			0 0.9rem 1.9rem color-mix(in oklab, black 24%, transparent),
			0 0 1.1rem color-mix(in oklab, var(--app-accent) 14%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 7%, transparent);
		transform: translateY(-1px);
	}

	.lobby-row:active {
		transform: translateY(1px) scale(0.995);
	}

	.lobby-row.joining {
		pointer-events: none;
		opacity: 0.72;
	}

	.lobby-row-meta {
		display: grid;
		gap: 0.22rem;
		min-width: 0;
	}

	.room-code {
		color: var(--app-text);
		font-family: var(--font-mono);
		font-size: 1.35rem;
		font-weight: 950;
		letter-spacing: 0.08em;
		line-height: 1;
	}

	.player-count {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		color: var(--app-muted);
		font-size: 0.78rem;
		font-weight: 850;
		line-height: 1;
	}

	.player-list {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		gap: 0.36rem 0.45rem;
		min-width: 0;
		max-height: 4.9rem;
		overflow: hidden;
	}

	.player-list.expanded {
		max-height: none;
	}

	.player-list.truncated::after {
		position: absolute;
		right: 0;
		bottom: 0;
		border-radius: 999px;
		background:
			linear-gradient(90deg, transparent, color-mix(in oklab, var(--app-input) 92%, var(--app-panel)) 34%),
			color-mix(in oklab, var(--app-input) 92%, var(--app-panel));
		color: var(--app-muted);
		content: '...';
		font-weight: 950;
		letter-spacing: 0.04em;
		padding: 0 0.18rem 0 1.6rem;
	}

	.player-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		min-width: 0;
		max-width: 100%;
		border: 1px solid color-mix(in oklab, var(--app-border) 58%, transparent);
		border-radius: 999px;
		background: color-mix(in oklab, var(--app-panel) 42%, transparent);
		color: var(--app-text);
		font-size: 0.84rem;
		font-weight: 850;
		line-height: 1;
		padding: 0.12rem 0.48rem 0.12rem 0.18rem;
	}

	.player-pill :global(.player-avatar) {
		width: 1.55rem;
		height: 1.55rem;
	}

	.player-pill :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.player-pill span:last-child {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.expand-button,
	.join-arrow {
		position: absolute;
		right: 0.65rem;
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
	}

	.expand-button {
		top: 0.52rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--app-muted);
		cursor: pointer;
		transition:
			background 160ms ease,
			color 160ms ease,
			transform 180ms ease;
	}

	.expand-button:hover {
		background: color-mix(in oklab, var(--app-accent) 16%, transparent);
		color: var(--app-accent);
	}

	.expand-button[aria-expanded='true'] {
		color: var(--app-accent);
		transform: rotate(180deg);
	}

	.join-arrow {
		right: 0.65rem;
		bottom: 0.56rem;
		color: var(--app-accent);
		opacity: 0.92;
		pointer-events: none;
	}

	.empty-lobby {
		display: grid;
		place-items: center;
		min-height: 8rem;
		border: 1px dashed color-mix(in oklab, var(--app-border) 78%, transparent);
		border-radius: 0.5rem;
		color: var(--app-muted);
		font-weight: 850;
		text-align: center;
	}

	.lobby-error {
		margin: 0;
		color: var(--app-error);
		font-size: 0.9rem;
		font-weight: 850;
		text-align: center;
	}

	:global(.spin) {
		animation: spin 850ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 460px) {
		.lobby-row {
			grid-template-columns: 1fr;
			gap: 0.65rem;
			padding-right: 3.1rem;
		}
	}
</style>
