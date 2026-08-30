<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/Avatar.svelte';
	import ErrorBox from '$lib/ErrorBox.svelte';
	import GameScreen from '$lib/GameScreen.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import { api } from '$lib/api';
	import { getAppContext } from '$lib/appContext';
	import { optimisticNewRoom } from '$lib/optimisticRoom.svelte';
	import { consumeEventIterator } from '@orpc/client';
	import { applyPhantomInkGameAction, type GameEvent, type PhantomInkGameState } from '@repo/shared/game';
	import {
		playerIdForUser,
		type PlayerId,
		type RoomMemberView,
		type RoomViewState,
		type RoomVoteSummary,
		type User,
		type WordMode,
	} from '@repo/shared/onlineGame';
	import type { Team } from '@repo/shared/types';
	import Check from '@lucide/svelte/icons/check';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import Tv from '@lucide/svelte/icons/tv';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import { onMount } from 'svelte';

	type VotingState = { voted: User['id'][]; eligible: User[]; required?: number };
	type PendingGameAction = { id: number; event: GameEvent };
	type RoomRequestPayload = { code?: string; room: RoomViewState };
	type DebugPayload = PhantomInkGameState | { state: PhantomInkGameState } | string;
	const reconnectDelayMs = 2500;

	let { data } = $props();
	const appContext = getAppContext();
	const roomCode = $derived(data.roomCode);
	let room = $state<RoomViewState | null>(initialRoom());
	let error = $state<unknown>(null);
	let pendingAction = $state<string | null>(null);
	let pendingGameActions = $state<PendingGameAction[]>([]);
	let optimisticGameState = $state<PhantomInkGameState | null>(null);
	let nextPendingGameActionId = 0;

	const members = $derived(room?.members ?? []);
	const self = $derived(room?.selfPlayerId ? members.find(member => member.id === room?.selfPlayerId) : null);
	const sunMembers = $derived(members.filter(member => member.role !== 'spectator' && member.team === 'sun'));
	const moonMembers = $derived(members.filter(member => member.role !== 'spectator' && member.team === 'moon'));
	const waitingMembers = $derived(members.filter(member => member.role === 'spectator'));
	const readyVote = $derived(voteSummary('ready'));
	const standardVote = $derived(voteSummary('word-mode:standard'));
	const customVote = $derived(voteSummary('word-mode:custom'));
	const targetWordMode = $derived<WordMode>(room?.wordMode === 'custom' ? 'standard' : 'custom');
	const selfWordVoteMode = $derived(selfPendingWordMode());
	const displayedWordMode = $derived(selfWordVoteMode ?? room?.wordMode ?? 'standard');
	const displayedWordVote = $derived(wordVoteForMode(selfWordVoteMode ?? targetWordMode));
	const displayedWordVoteLabel = $derived(
		(selfWordVoteMode ?? targetWordMode) === 'custom' ? 'Custom words' : 'Standard words',
	);
	const readyVoting = $derived(votingFor(readyVote));
	const displayedWordVoting = $derived(votingFor(displayedWordVote));
	const fallbackSelfPlayerId = $derived(appContext.user.id > 0 ? playerIdForUser(appContext.user.id) : null);
	const selfIsReady = $derived(Boolean(self && readyVote?.voterIds.includes(self.id)));
	const gamePlayers = $derived(members.map(memberToUser));
	const canUseTeamControls = $derived(
		Boolean(roomCode && room?.status === 'connected' && room.phase === 'lobby' && self),
	);
	const activeGameState = $derived(optimisticGameState ?? room?.gameState ?? null);
	const tvMode = $derived(self?.role === 'spectator');
	const canUseLobbyControls = $derived(Boolean(canUseTeamControls && self?.role !== 'spectator'));
	const readyButtonLabel = $derived(room?.startProblem ?? 'Ready?');

	$effect(() => {
		type DebugWindow = Window & {
			DEBUG?: Record<string, unknown> & {
				getState?: () => PhantomInkGameState | null;
				setState?: (payload: DebugPayload) => Promise<PhantomInkGameState>;
				loadState?: (payload: DebugPayload) => Promise<PhantomInkGameState>;
				getRoom?: () => RoomViewState | null;
			};
		};

		const root = window as DebugWindow;
		root.DEBUG ??= {};
		const getState = () => {
			const state = $state.snapshot(activeGameState);
			return state ? structuredClone(state) : null;
		};
		const getRoom = () => {
			const currentRoom = $state.snapshot(room);
			return currentRoom ? structuredClone(currentRoom) : null;
		};
		const setState = (payload: DebugPayload) => loadDebugState(payload);
		root.DEBUG.getState = getState;
		root.DEBUG.setState = setState;
		root.DEBUG.loadState = setState;
		root.DEBUG.getRoom = getRoom;

		return () => {
			if (root.DEBUG?.getState === getState) delete root.DEBUG.getState;
			if (root.DEBUG?.setState === setState) delete root.DEBUG.setState;
			if (root.DEBUG?.loadState === setState) delete root.DEBUG.loadState;
			if (root.DEBUG?.getRoom === getRoom) delete root.DEBUG.getRoom;
		};
	});

	onMount(() => {
		const initialRoomCode = roomCode;
		if (!data.isCreatingRoom && !initialRoomCode) {
			void goto(lobbyHref(), { noScroll: true });
			return;
		}

		let closeEvents: (() => void) | null = null;
		let reconnectTimer: number | undefined;
		let connectionVersion = 0;
		let connecting = false;
		let cancelled = false;

		function clearReconnectTimer() {
			if (reconnectTimer === undefined) return;
			window.clearTimeout(reconnectTimer);
			reconnectTimer = undefined;
		}

		function scheduleReconnect() {
			if (cancelled || reconnectTimer !== undefined) return;
			reconnectTimer = window.setTimeout(() => {
				reconnectTimer = undefined;
				void connect();
			}, reconnectDelayMs);
		}

		function retryNow() {
			if (!error || document.visibilityState === 'hidden') return;
			clearReconnectTimer();
			void connect();
		}

		async function connect() {
			if (cancelled || connecting) return;
			connecting = true;
			const version = ++connectionVersion;
			const stopEvents = closeEvents;
			closeEvents = null;
			stopEvents?.();
			try {
				const userId = appContext.user.id;
				const payload: RoomRequestPayload = data.isCreatingRoom
					? await api.rooms.create({ userId })
					: await api.rooms.join({ code: initialRoomCode as string, userId });
				if (cancelled) return;

				room = payload.room;
				rebuildOptimisticGame();
				error = null;

				const connectedCode = payload.code ?? initialRoomCode;
				if (!connectedCode) {
					await goto(lobbyHref(), { noScroll: true });
					return;
				}

				if (data.isCreatingRoom) {
					await goto(roomHref(connectedCode), {
						replaceState: true,
						noScroll: true,
						state: { optimisticRoom: payload.room },
					});
					return;
				}

				const cancel = consumeEventIterator(api.rooms.events({ code: connectedCode, userId }), {
					onEvent: payload => {
						if (cancelled || version !== connectionVersion) return;
						const nextRoom = payload.room;
						room = nextRoom;
						rebuildOptimisticGame();
						error = null;
					},
					onError: caught => {
						if (cancelled || version !== connectionVersion) return;
						error = caught;
						scheduleReconnect();
					},
				});
				closeEvents = () => {
					void cancel();
				};
			} catch (caught) {
				if (!cancelled && version === connectionVersion) {
					error = caught;
					scheduleReconnect();
				}
			} finally {
				connecting = false;
			}
		}

		void connect();
		window.addEventListener('online', retryNow);
		document.addEventListener('visibilitychange', retryNow);
		return () => {
			cancelled = true;
			connectionVersion += 1;
			clearReconnectTimer();
			closeEvents?.();
			window.removeEventListener('online', retryNow);
			document.removeEventListener('visibilitychange', retryNow);
		};
	});

	function initialRoom(): RoomViewState | null {
		if (page.state.optimisticRoom) return page.state.optimisticRoom;
		if (!data.isCreatingRoom) return null;

		return optimisticNewRoom(appContext.user);
	}

	function roomHref(code: string): string {
		return `/room/${code}${page.url.search}${page.url.hash}`;
	}

	function lobbyHref(): string {
		return `/lobby${page.url.search}${page.url.hash}`;
	}

	function voteSummary(action: RoomVoteSummary['action']): RoomVoteSummary | null {
		return room?.votes.find(vote => vote.action === action) ?? null;
	}

	function hasOtherPendingVote(summary: RoomVoteSummary | null): boolean {
		return Boolean(
			self && summary && !summary.consensus && summary.currentVotes > 0 && !summary.voterIds.includes(self.id),
		);
	}

	function hasOtherPendingWordVote(summary: RoomVoteSummary | null): boolean {
		return Boolean(!selfWordVoteMode && hasOtherPendingVote(summary));
	}

	function selfPendingWordMode(): WordMode | null {
		if (!self) return null;
		if (customVote && !customVote.consensus && customVote.voterIds.includes(self.id)) return 'custom';
		if (standardVote && !standardVote.consensus && standardVote.voterIds.includes(self.id)) return 'standard';
		return null;
	}

	function wordVoteForMode(mode: WordMode): RoomVoteSummary | null {
		return mode === 'custom' ? customVote : standardVote;
	}

	function votingFor(summary: RoomVoteSummary | null): VotingState | undefined {
		if (!summary) return undefined;
		return {
			voted: userIdsForPlayerIds(summary.voterIds),
			eligible: usersForPlayerIds(summary.eligiblePlayerIds),
			required: summary.requiredVotes,
		};
	}

	function userIdsForPlayerIds(playerIds: readonly PlayerId[]): User['id'][] {
		return playerIds.map(playerId => memberForPlayerId(playerId).userId);
	}

	function usersForPlayerIds(playerIds: readonly PlayerId[]): User[] {
		return playerIds.map(playerId => memberToUser(memberForPlayerId(playerId)));
	}

	function memberForPlayerId(playerId: PlayerId): RoomMemberView {
		return members.find(member => member.id === playerId)!;
	}

	function memberToUser(member: RoomMemberView): User {
		return {
			id: member.userId,
			name: member.name,
			color: member.color,
			icon: member.icon,
		};
	}

	async function switchTeam(team: Team) {
		if (!roomCode || !self || !canUseTeamControls || pendingAction) return;
		if (self.role !== 'spectator' && self.team === team) return;
		pendingAction = `team:${team}`;
		try {
			const userId = appContext.user.id;

			const payload = await api.rooms.action({
				code: roomCode,
				userId,
				action: {
					type: 'set-seat',
					actorId: self.id,
					team,
					role: self.role === 'spectator' ? 'medium' : self.role,
				},
			});
			room = payload.room;
			rebuildOptimisticGame();
		} catch (caught) {
			error = caught;
		} finally {
			pendingAction = null;
		}
	}

	async function toggleTvMode() {
		if (!roomCode || !self || !canUseTeamControls || pendingAction) return;
		pendingAction = 'tv-mode';
		try {
			const payload = await api.rooms.action({
				code: roomCode,
				userId: appContext.user.id,
				action: {
					type: 'set-seat',
					actorId: self.id,
					team: self.team,
					role: tvMode ? 'medium' : 'spectator',
				},
			});
			room = payload.room;
			rebuildOptimisticGame();
		} catch (caught) {
			error = caught;
		} finally {
			pendingAction = null;
		}
	}

	async function voteReady() {
		if (!roomCode || !self || !canUseLobbyControls || pendingAction) return;
		pendingAction = 'ready';
		try {
			const userId = appContext.user.id;

			const payload = await api.rooms.action({
				code: roomCode,
				userId,
				action: {
					type: 'vote',
					actorId: self.id,
					vote: { type: 'ready' },
				},
			});
			room = payload.room;
			rebuildOptimisticGame();
		} catch (caught) {
			error = caught;
		} finally {
			pendingAction = null;
		}
	}

	async function voteWordMode(mode: WordMode) {
		if (!roomCode || !self || !canUseLobbyControls || pendingAction) return;
		pendingAction = `word:${mode}`;
		try {
			const userId = appContext.user.id;

			const payload = await api.rooms.action({
				code: roomCode,
				userId,
				action: {
					type: 'vote',
					actorId: self.id,
					vote: { type: 'word-mode', mode },
				},
			});
			room = payload.room;
			rebuildOptimisticGame();
		} catch (caught) {
			error = caught;
		} finally {
			pendingAction = null;
		}
	}

	async function sendGameEvent(event: GameEvent) {
		if (!roomCode || !self || !room?.gameState) return;

		const pending = { id: ++nextPendingGameActionId, event };
		pendingGameActions = [...pendingGameActions, pending];
		rebuildOptimisticGame();

		try {
			const payload = await api.rooms.action({
				code: roomCode,
				userId: appContext.user.id,
				action: {
					type: 'game-action',
					actorId: self.id,
					action: event,
				},
			});
			room = payload.room;
		} catch (caught) {
			error = caught;
		} finally {
			pendingGameActions = pendingGameActions.filter(action => action.id !== pending.id);
			rebuildOptimisticGame();
		}
	}

	async function loadDebugState(payload: DebugPayload): Promise<PhantomInkGameState> {
		if (!roomCode || !self) throw new Error('Room is not connected');

		pendingGameActions = [];
		optimisticGameState = null;
		const state = parseDebugPayload(payload);
		const response = await api.rooms.action({
			code: roomCode,
			userId: appContext.user.id,
			action: {
				type: 'load-state',
				actorId: self.id,
				state,
			},
		});
		room = response.room;
		error = null;
		return structuredClone(response.room.gameState!);
	}

	function parseDebugPayload(payload: DebugPayload): PhantomInkGameState {
		const parsed = typeof payload === 'string' ? (JSON.parse(payload) as Exclude<DebugPayload, string>) : payload;
		return structuredClone(typeof parsed.state === 'object' ? parsed.state : parsed);
	}

	function rebuildOptimisticGame() {
		if (!room?.gameState || !pendingGameActions.length) {
			optimisticGameState = null;
			return;
		}

		const next = structuredClone($state.snapshot(room.gameState));
		for (const pending of pendingGameActions) {
			applyPhantomInkGameAction(next, pending.event);
		}
		optimisticGameState = next;
	}
</script>

<svelte:head>
	<title>{roomCode ?? 'Room'} | Phantom Ink</title>
</svelte:head>

<section class:tv-mode={tvMode} class="room-screen" aria-label={roomCode ? `Room ${roomCode}` : 'Room'}>
	{#if self && room?.phase === 'lobby'}
		<button
			class="tv-mode-toggle"
			data-active={tvMode ? 'true' : undefined}
			disabled={!canUseTeamControls || pendingAction === 'tv-mode'}
			onclick={toggleTvMode}
			type="button"
		>
			{#if pendingAction === 'tv-mode'}
				<LoaderCircle class="spin" size={18} strokeWidth={2.4} />
			{:else}
				<Tv size={18} strokeWidth={2.2} />
			{/if}
			<span>TV mode</span>
		</button>
	{/if}
	{#if room?.phase === 'playing' && activeGameState}
		<GameScreen
			game={activeGameState.context}
			state={activeGameState.state}
			players={gamePlayers}
			{tvMode}
			viewerId={appContext.user.id}
			send={event => void sendGameEvent(event)}
		/>
	{:else}
		<div class="room-settings">
			<div
				class:otherVoted={hasOtherPendingWordVote(displayedWordVote)}
				class:selfVoted={Boolean(selfWordVoteMode)}
				class="word-toggle-wrap"
				data-checked={displayedWordMode === 'custom' ? 'true' : undefined}
			>
				<InkButton
					aria-checked={displayedWordMode === 'custom'}
					class="word-toggle"
					data-checked={displayedWordMode === 'custom' ? 'true' : undefined}
					disabled={!canUseLobbyControls || pendingAction === `word:${targetWordMode}`}
					ghost
					onclick={() => void voteWordMode(targetWordMode)}
					role="checkbox"
					type="button"
					voteLabel={displayedWordVoteLabel}
					voting={displayedWordVoting}
				>
					<span class="checkbox-mark">
						{#if pendingAction === `word:${targetWordMode}`}
							<LoaderCircle class="spin" size={17} strokeWidth={2.4} />
						{:else if displayedWordMode === 'custom'}
							<Check size={18} strokeWidth={2.8} />
						{/if}
					</span>
					<span>Use your own words</span>
				</InkButton>
			</div>
		</div>

		<div class="teams-grid">
			{@render TeamColumn({
				team: 'sun',
				members: sunMembers,
				selfId: room?.selfPlayerId ?? fallbackSelfPlayerId,
				pending: pendingAction === 'team:sun',
				onSwitch: () => switchTeam('sun'),
			})}
			{@render TeamColumn({
				team: 'moon',
				members: moonMembers,
				selfId: room?.selfPlayerId ?? fallbackSelfPlayerId,
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
				<InkButton
					class="ready-button"
					disabled={!canUseLobbyControls || Boolean(room?.startProblem) || pendingAction === 'ready'}
					fill
					icon={selfIsReady ? Check : CircleDashed}
					iconSize={24}
					iconStrokeWidth={selfIsReady ? 2.7 : 2.4}
					loading={pendingAction === 'ready'}
					onclick={voteReady}
					primary
					type="button"
					voteLabel="Ready"
					voting={readyVoting}
				>
					{readyButtonLabel}
				</InkButton>
			</div>
		</div>
	{/if}

	{#if error}
		<ErrorBox {error} />
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
		disabled={pending || !canUseTeamControls}
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
		<Avatar user={member} name={false} />
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

	.tv-mode-toggle {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 50;
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		min-height: 2.45rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 76%, transparent);
		border-radius: 0.45rem;
		background: color-mix(in oklab, var(--app-panel) 88%, transparent);
		box-shadow: 0 0.55rem 1.5rem color-mix(in oklab, black 28%, transparent);
		color: var(--app-muted);
		cursor: pointer;
		font-size: 0.86rem;
		font-weight: 900;
		padding: 0.45rem 0.68rem;
	}

	.tv-mode-toggle[data-active='true'] {
		border-color: color-mix(in oklab, var(--app-accent) 68%, var(--app-border));
		background: color-mix(in oklab, var(--app-accent) 16%, var(--app-panel));
		color: var(--app-accent);
		filter: drop-shadow(0 0 0.55rem color-mix(in oklab, var(--app-accent) 26%, transparent));
	}

	.tv-mode-toggle:disabled {
		cursor: default;
	}

	:global(.screen-shell.room-shell:has(.room-screen.tv-mode)) {
		width: calc(100vw - 1.7rem);
		max-width: none;
	}

	.room-settings {
		display: flex;
		align-items: flex-start;
		min-width: 0;
		padding-right: 7.5rem;
	}

	.word-toggle-wrap {
		position: relative;
		display: inline-flex;
		min-width: 0;
		overflow: visible;
	}

	.word-toggle-wrap :global(.ink-button.word-toggle) {
		gap: 0.62rem;
		min-height: 3rem;
		border-color: color-mix(in oklab, var(--app-border) 72%, transparent);
		border-radius: 0.45rem;
		background: color-mix(in oklab, var(--app-input) 54%, transparent);
		color: var(--app-text);
		font-size: clamp(1rem, 2.2vw, 1.28rem);
		font-weight: 950;
		padding: 0 2.9rem 0 0.85rem;
	}

	.word-toggle-wrap :global(.ink-button.word-toggle:hover:not(:disabled)),
	.word-toggle-wrap :global(.ink-button.word-toggle[data-checked='true']) {
		border-color: color-mix(in oklab, var(--app-accent) 58%, var(--app-border));
		background: color-mix(in oklab, var(--app-accent) 12%, var(--app-input));
	}

	.checkbox-mark {
		display: inline-grid;
		place-items: center;
		width: 1.28rem;
		height: 1.28rem;
		border: 2px solid color-mix(in oklab, var(--app-accent) 62%, var(--app-border));
		border-radius: 0.28rem;
		color: #102014;
		background: color-mix(in oklab, var(--app-panel) 72%, transparent);
	}

	.word-toggle-wrap[data-checked='true'] .checkbox-mark {
		border-color: #78d88d;
		background: #78d88d;
	}

	.word-toggle-wrap.selfVoted :global(.ink-button.word-toggle) {
		border-color: color-mix(in oklab, #d85b68 74%, var(--app-border));
		background: color-mix(in oklab, #d85b68 13%, var(--app-input));
	}

	.word-toggle-wrap.selfVoted .checkbox-mark {
		border-color: #d85b68;
		background: color-mix(in oklab, #d85b68 22%, var(--app-panel));
		box-shadow: 0 0 0.75rem color-mix(in oklab, #d85b68 28%, transparent);
		color: #ffd9dd;
	}

	.checkbox-mark {
		position: relative;
	}

	.word-toggle-wrap.otherVoted .checkbox-mark::after {
		position: absolute;
		inset: -0.42rem;
		border: 2px dashed color-mix(in oklab, var(--app-accent) 72%, transparent);
		border-radius: 0.46rem;
		animation: checkbox-vote 1.45s linear infinite;
		content: '';
	}

	.teams-grid {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		min-width: 0;
		min-height: clamp(13rem, 34dvh, 19rem);
		background: transparent;
		overflow: hidden;
	}

	.teams-grid::after {
		position: absolute;
		top: 0.8rem;
		bottom: 0.8rem;
		left: 50%;
		width: 1px;
		background: color-mix(in oklab, var(--app-border) 54%, transparent);
		box-shadow:
			-0.45rem 0 1.45rem color-mix(in oklab, #e1aa57 34%, transparent),
			0.45rem 0 1.45rem color-mix(in oklab, #a997ff 38%, transparent);
		content: '';
		pointer-events: none;
		transform: translateX(-50%);
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

	.team-column:hover:not(:disabled) {
		background: color-mix(in oklab, var(--team-color) 5%, transparent);
	}

	.team-column:active:not(:disabled) {
		transform: scale(0.995);
	}

	.team-icon {
		position: absolute;
		top: 0.7rem;
		display: grid;
		width: 5.4rem;
		height: 5.4rem;
		color: color-mix(in oklab, var(--team-color) 68%, transparent);
		filter: drop-shadow(0 0 0.45rem color-mix(in oklab, var(--team-color) 30%, transparent))
			drop-shadow(0 0 1.2rem color-mix(in oklab, var(--team-color) 14%, transparent));
		opacity: 0.56;
		pointer-events: none;
		place-items: center;
	}

	.team-icon::before {
		position: absolute;
		inset: -0.4rem;
		border-radius: 999px;
		background: radial-gradient(
			circle,
			color-mix(in oklab, var(--team-color) 32%, transparent) 0%,
			color-mix(in oklab, var(--team-color) 14%, transparent) 38%,
			transparent 72%
		);
		content: '';
		opacity: 0.42;
		transform: scale(0.9);
	}

	.team-icon :global(svg) {
		position: relative;
		z-index: 1;
	}

	.team-column[aria-pressed='true'] .team-icon {
		animation: team-icon-pulse 3.8s ease-in-out infinite;
		color: var(--team-color);
		opacity: 0.96;
	}

	.team-column[aria-pressed='true'] .team-icon::before {
		animation: team-aura-pulse 3.8s ease-in-out infinite;
		opacity: 0.72;
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

	.player-pill :global(.avatar) {
		display: inline-grid;
		place-items: center;
		width: 1.7rem;
		height: 1.7rem;
		flex: 0 0 auto;
	}

	.player-pill :global(.avatar svg) {
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

	.ready-action :global(.ink-button.ready-button) {
		gap: 0.4rem;
		justify-content: center;
		min-height: 3.2rem;
		border-radius: 0.45rem;
		font-size: 1.05rem;
		font-weight: 950;
		padding: 0 3rem 0 0.9rem;
	}

	.ready-action :global(.ink-button.ready-button .ink-button-icon) {
		color: currentColor;
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

	.spin {
		animation: spin 850ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes team-icon-pulse {
		0%,
		100% {
			filter: drop-shadow(0 0 0.55rem color-mix(in oklab, var(--team-color) 42%, transparent))
				drop-shadow(0 0 1.35rem color-mix(in oklab, var(--team-color) 24%, transparent));
		}

		50% {
			filter: drop-shadow(0 0 0.85rem color-mix(in oklab, var(--team-color) 66%, transparent))
				drop-shadow(0 0 1.85rem color-mix(in oklab, var(--team-color) 36%, transparent));
		}
	}

	@keyframes team-aura-pulse {
		0%,
		100% {
			opacity: 0.52;
			transform: scale(0.92);
		}

		50% {
			opacity: 0.9;
			transform: scale(1.06);
		}
	}

	@keyframes checkbox-vote {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 560px) {
		.teams-grid {
			min-height: 16rem;
		}

		.word-toggle-wrap,
		.word-toggle-wrap :global(.ink-button.word-toggle) {
			width: 100%;
		}
	}
</style>
