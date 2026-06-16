<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PlayerAvatar from '$lib/PlayerAvatar.svelte';
	import VoteBadge from '$lib/VoteBadge.svelte';
	import { joinRoom, openRoomEvents, sendRoomAction } from '$lib/api';
	import { parseRoomCode } from '$lib/roomCodes';
	import { LS, storageKeys } from '$lib/storage';
	import {
		PLAYER_COLOR_PRESETS,
		playerIdForUser,
		type RoomMemberView,
		type RoomViewState,
		type RoomVoteSummary,
		type Team,
		type WordMode,
	} from '@repo/shared/onlineGame';
	import Check from '@lucide/svelte/icons/check';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Moon from '@lucide/svelte/icons/moon';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Sun from '@lucide/svelte/icons/sun';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import { onMount } from 'svelte';

	const roomCode = $derived(parseRoomCode(page.params.code));
	let room = $state<RoomViewState | null>(null);
	let error = $state<string | null>(null);
	let pendingAction = $state<string | null>(null);

	const members = $derived(room?.members ?? []);
	const self = $derived(room?.selfPlayerId ? members.find(member => member.id === room?.selfPlayerId) : null);
	const sunMembers = $derived(members.filter(member => member.role !== 'spectator' && member.team === 'sun'));
	const moonMembers = $derived(members.filter(member => member.role !== 'spectator' && member.team === 'moon'));
	const waitingMembers = $derived(members.filter(member => member.role === 'spectator'));
	const readyVote = $derived(voteSummary('ready'));
	const standardVote = $derived(voteSummary('word-mode:standard'));
	const customVote = $derived(voteSummary('word-mode:custom'));
	const selfIsReady = $derived(Boolean(self && readyVote?.voterIds.includes(self.id)));
	const canUseLobbyControls = $derived(
		Boolean(roomCode && room?.phase === 'lobby' && self && self.role !== 'spectator'),
	);

	onMount(() => {
		if (!roomCode) {
			void goto(`/lobby${page.url.search}${page.url.hash}`, { noScroll: true });
			return;
		}

		let events: EventSource | null = null;
		let cancelled = false;

		async function connect() {
			try {
				room = await joinRoom(roomCode ?? '', LS.get(storageKeys.playerName) ?? '');
				if (cancelled || !roomCode) return;
				events = openRoomEvents(
					roomCode,
					nextRoom => {
						room = nextRoom;
						error = null;
					},
					() => {
						error = 'Connection faded.';
					},
				);
			} catch (caught) {
				if (!cancelled) error = caught instanceof Error ? caught.message : 'Unable to join séance.';
			}
		}

		void connect();
		return () => {
			cancelled = true;
			events?.close();
		};
	});

	function voteSummary(action: RoomVoteSummary['action']): RoomVoteSummary | null {
		return room?.votes.find(vote => vote.action === action) ?? null;
	}

	function colorValue(member: RoomMemberView): string {
		return PLAYER_COLOR_PRESETS.find(preset => preset.id === member.color)?.value ?? PLAYER_COLOR_PRESETS[0].value;
	}

	async function switchTeam(team: Team) {
		if (!roomCode || !self || room?.phase !== 'lobby' || pendingAction) return;
		if (self.role !== 'spectator' && self.team === team) return;
		pendingAction = `team:${team}`;
		try {
			room = await sendRoomAction(roomCode, {
				type: 'set-seat',
				actorId: self.id,
				team,
				role: self.role === 'spectator' ? 'medium' : self.role,
			});
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to switch sides.';
		} finally {
			pendingAction = null;
		}
	}

	async function voteReady() {
		if (!roomCode || !self || !canUseLobbyControls || pendingAction) return;
		pendingAction = 'ready';
		try {
			room = await sendRoomAction(roomCode, { type: 'vote', actorId: self.id, vote: { type: 'ready' } });
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to update readiness.';
		} finally {
			pendingAction = null;
		}
	}

	async function voteWordMode(mode: WordMode) {
		if (!roomCode || !self || !canUseLobbyControls || pendingAction) return;
		pendingAction = `word:${mode}`;
		try {
			room = await sendRoomAction(roomCode, {
				type: 'vote',
				actorId: self.id,
				vote: { type: 'word-mode', mode },
			});
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to update word settings.';
		} finally {
			pendingAction = null;
		}
	}

	function storedUserPlayerId(): string | null {
		const userId = LS.get(storageKeys.serverUserId);
		return typeof userId === 'number' ? playerIdForUser(userId) : null;
	}
</script>

<svelte:head>
	<title>{roomCode ?? 'Room'} | Phantom Ink</title>
</svelte:head>

<section class="room-screen" aria-label={roomCode ? `Room ${roomCode}` : 'Room'}>
	{#if room?.phase === 'playing'}
		<div class="started-screen">
			<Sparkles size={38} strokeWidth={1.7} />
			<h1>Game started</h1>
		</div>
	{:else}
		<div class="room-settings">
			<span class="setting-label">Words</span>
			<div class="word-options" aria-label="Word mode">
				<div class:selected={room?.wordMode === 'standard'} class="word-option-wrap">
					<button
						disabled={!canUseLobbyControls || pendingAction === 'word:standard'}
						onclick={() => voteWordMode('standard')}
						type="button"
					>
						{#if pendingAction === 'word:standard'}
							<LoaderCircle class="spin" size={17} strokeWidth={2.4} />
						{/if}
						<span>Standard</span>
					</button>
					<VoteBadge summary={standardVote} {members} label="Standard words" />
				</div>
				<div class:selected={room?.wordMode === 'custom'} class="word-option-wrap">
					<button
						disabled={!canUseLobbyControls || pendingAction === 'word:custom'}
						onclick={() => voteWordMode('custom')}
						type="button"
					>
						{#if pendingAction === 'word:custom'}
							<LoaderCircle class="spin" size={17} strokeWidth={2.4} />
						{/if}
						<span>Custom</span>
					</button>
					<VoteBadge summary={customVote} {members} label="Custom words" />
				</div>
			</div>
		</div>

		<div class="teams-grid">
			{@render TeamColumn({
				team: 'sun',
				members: sunMembers,
				selfId: room?.selfPlayerId ?? storedUserPlayerId(),
				pending: pendingAction === 'team:sun',
				onSwitch: () => switchTeam('sun'),
			})}
			{@render TeamColumn({
				team: 'moon',
				members: moonMembers,
				selfId: room?.selfPlayerId ?? storedUserPlayerId(),
				pending: pendingAction === 'team:moon',
				onSwitch: () => switchTeam('moon'),
			})}
		</div>

		{#if waitingMembers.length}
			<div class="waiting-area">
				<div class="waiting-title">
					<UsersRound size={17} strokeWidth={2.2} />
					<span>Waiting area</span>
				</div>
				<div class="waiting-list">
					{#each waitingMembers as member (member.id)}
						{@render PlayerPill({ member })}
					{/each}
				</div>
			</div>
		{/if}

		<div class="ready-dock">
			<div class="ready-action">
				<VoteBadge summary={readyVote} {members} label="Ready" />
				<button
					class:ready={selfIsReady}
					disabled={!canUseLobbyControls || Boolean(room?.startProblem) || pendingAction === 'ready'}
					onclick={voteReady}
					type="button"
				>
					{#if pendingAction === 'ready'}
						<LoaderCircle class="spin" size={23} strokeWidth={2.4} />
					{:else if selfIsReady}
						<Check size={24} strokeWidth={2.7} />
					{:else}
						<CircleDashed size={24} strokeWidth={2.4} />
					{/if}
					<span>{selfIsReady ? 'Ready' : 'Ready up'}</span>
				</button>
				{#if room?.startProblem}
					<div class="ready-problem">{room.startProblem}</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if error}
		<p class="room-error">{error}</p>
	{/if}
</section>

{#snippet TeamColumn({
	team,
	members,
	selfId,
	pending,
	onSwitch,
}: {
	team: Team;
	members: RoomMemberView[];
	selfId: string | null;
	pending: boolean;
	onSwitch: () => void;
})}
	<button
		aria-label={team === 'sun' ? 'Join sun side' : 'Join moon side'}
		aria-pressed={members.some(member => member.id === selfId)}
		class={`team-column ${team}`}
		disabled={pending || !canUseLobbyControls}
		onclick={onSwitch}
		type="button"
	>
		<div class="team-icon" aria-hidden="true">
			{#if team === 'sun'}
				<Sun size={82} strokeWidth={1.35} />
			{:else}
				<Moon size={82} strokeWidth={1.35} />
			{/if}
		</div>
		<div class="team-members">
			{#if members.length}
				{#each members as member (member.id)}
					{@render PlayerPill({ member, isSelf: member.id === selfId })}
				{/each}
			{:else}
				<div class="empty-side">No one yet</div>
			{/if}
		</div>
	</button>
{/snippet}

{#snippet PlayerPill({ member, isSelf = false }: { member: RoomMemberView; isSelf?: boolean })}
	<div class:self={isSelf} class="player-pill">
		<PlayerAvatar color={colorValue(member)} icon={member.icon} label={`${member.name} avatar`} />
		<span>{member.name}</span>
	</div>
{/snippet}

<style>
	.room-screen {
		position: relative;
		display: grid;
		gap: 1.05rem;
		min-height: clamp(16rem, 52dvh, 32rem);
		padding-bottom: 0.2rem;
	}

	.room-settings {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.85rem;
		align-items: center;
		min-width: 0;
	}

	.setting-label {
		color: var(--app-muted);
		font-size: 0.82rem;
		font-weight: 850;
		line-height: 1;
	}

	.word-options {
		display: inline-grid;
		grid-template-columns: repeat(2, minmax(7.9rem, 1fr));
		justify-self: end;
		gap: 0.5rem;
		width: min(100%, 16.8rem);
	}

	.word-option-wrap {
		position: relative;
		min-width: 0;
		overflow: visible;
	}

	.word-option-wrap > button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		width: 100%;
		min-height: 3.15rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 72%, transparent);
		border-radius: 0.45rem;
		background: color-mix(in oklab, var(--app-input) 70%, transparent);
		color: var(--app-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.86rem;
		font-weight: 950;
		padding: 0.7rem 2.75rem 0.7rem 0.7rem;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	.word-option-wrap.selected > button,
	.word-option-wrap > button:hover:not(:disabled) {
		border-color: color-mix(in oklab, var(--app-accent) 64%, var(--app-border));
		background: color-mix(in oklab, var(--app-accent) 16%, var(--app-input));
		color: var(--app-text);
	}

	.word-option-wrap > button:active:not(:disabled) {
		transform: translateY(1px) scale(0.99);
	}

	.teams-grid {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		min-width: 0;
		min-height: clamp(13rem, 34dvh, 19rem);
		background: color-mix(in oklab, var(--app-input) 24%, transparent);
		overflow: hidden;
	}

	.teams-grid::before {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse at 13% 18%, color-mix(in oklab, #e1aa57 16%, transparent), transparent 42%),
			radial-gradient(ellipse at 87% 18%, color-mix(in oklab, #a997ff 16%, transparent), transparent 42%);
		content: '';
		pointer-events: none;
	}

	.teams-grid::after {
		position: absolute;
		top: 0.8rem;
		bottom: 0.8rem;
		left: calc(50% - 1.1rem);
		width: 2.2rem;
		background:
			linear-gradient(90deg, transparent, color-mix(in oklab, var(--app-border) 44%, transparent), transparent),
			radial-gradient(ellipse at center, color-mix(in oklab, var(--app-accent) 14%, transparent), transparent 66%);
		content: '';
		pointer-events: none;
	}

	.team-column {
		--team-color: var(--app-accent);
		position: relative;
		display: grid;
		align-content: stretch;
		gap: 0.75rem;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--app-text);
		cursor: pointer;
		font: inherit;
		padding: 1rem;
		text-align: left;
		transition:
			background 180ms ease,
			filter 180ms ease,
			transform 180ms ease;
	}

	.team-column.sun {
		--team-color: #e1aa57;
	}

	.team-column.moon {
		--team-color: #a997ff;
	}

	.team-column:hover:not(:disabled),
	.team-column[aria-pressed='true'] {
		background: color-mix(in oklab, var(--team-color) 9%, transparent);
	}

	.team-column:active:not(:disabled) {
		transform: scale(0.995);
	}

	.team-icon {
		position: absolute;
		top: 0.7rem;
		color: color-mix(in oklab, var(--team-color) 54%, transparent);
		opacity: 0.55;
		pointer-events: none;
	}

	.team-column.sun .team-icon {
		left: 0.85rem;
	}

	.team-column.moon .team-icon {
		right: 0.85rem;
	}

	.team-members,
	.waiting-list {
		position: relative;
		z-index: 1;
		display: grid;
		align-content: end;
		gap: 0.46rem;
		min-width: 0;
		min-height: 100%;
		padding-top: 4.5rem;
	}

	.team-column.sun .team-members {
		justify-items: start;
	}

	.team-column.moon .team-members {
		justify-items: end;
	}

	.player-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		min-width: 0;
		color: var(--app-text);
		font-size: 1rem;
		font-weight: 900;
		line-height: 1;
		padding: 0.14rem 0;
	}

	.team-column.moon .player-pill {
		flex-direction: row-reverse;
		text-align: right;
	}

	.player-pill.self {
		color: var(--team-color, var(--app-accent));
		filter: drop-shadow(0 0 0.45rem color-mix(in oklab, var(--team-color, var(--app-accent)) 28%, transparent));
	}

	.player-pill :global(.player-avatar) {
		width: 1.7rem;
		height: 1.7rem;
	}

	.player-pill :global(.player-avatar svg) {
		width: 1.32rem;
		height: 1.32rem;
	}

	.player-pill span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty-side {
		color: var(--app-muted);
		font-size: 0.84rem;
		font-weight: 850;
	}

	.ready-action > button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		border: 1px solid color-mix(in oklab, var(--app-accent) 58%, var(--app-border));
		border-radius: 0.45rem;
		background: color-mix(in oklab, var(--app-accent) 14%, var(--app-input));
		color: var(--app-text);
		cursor: pointer;
		font: inherit;
		font-size: 1.05rem;
		font-weight: 950;
		min-height: 3.2rem;
		padding: 0 3rem 0 0.9rem;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			transform 180ms ease;
	}

	.ready-action > button:hover:not(:disabled) {
		border-color: color-mix(in oklab, var(--app-accent) 72%, var(--app-border));
		background: color-mix(in oklab, var(--app-accent) 18%, var(--app-input));
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--app-accent) 16%, transparent);
	}

	button:disabled {
		cursor: default;
		opacity: 0.58;
	}

	.waiting-area {
		display: grid;
		gap: 0.5rem;
		padding: 0.1rem 0;
	}

	.waiting-title {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--app-muted);
		font-size: 0.82rem;
		font-weight: 950;
	}

	.ready-dock {
		position: sticky;
		bottom: -0.8rem;
		z-index: 4;
		margin: 0 -0.8rem -0.8rem;
		padding: 0.75rem 0.8rem 0.8rem;
		background: linear-gradient(180deg, transparent, var(--app-panel) 34%);
	}

	.ready-action {
		position: relative;
		display: grid;
		gap: 0.35rem;
		overflow: visible;
	}

	.ready-action > button.ready {
		background: linear-gradient(180deg, color-mix(in oklab, #78d88d 80%, white 20%), #78d88d), #78d88d;
		border-color: #78d88d;
		color: #102014;
	}

	.ready-problem,
	.room-error {
		color: var(--app-error);
		font-size: 0.86rem;
		font-weight: 850;
		text-align: center;
	}

	.started-screen {
		display: grid;
		place-items: center;
		align-content: center;
		gap: 0.65rem;
		min-height: clamp(14rem, 44dvh, 26rem);
		color: var(--app-accent);
		text-align: center;
	}

	.started-screen h1 {
		margin: 0;
		color: var(--app-text);
		font-size: clamp(2rem, 9vw, 3.7rem);
		font-weight: 950;
		line-height: 0.95;
	}

	.room-error {
		margin: 0;
	}

	.spin {
		animation: spin 850ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 560px) {
		.room-settings {
			grid-template-columns: 1fr;
		}

		.teams-grid {
			min-height: 16rem;
		}

		.word-options {
			justify-self: stretch;
			width: 100%;
		}
	}
</style>
