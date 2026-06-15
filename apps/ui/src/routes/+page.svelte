<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BOARD_TEMPLATE,
		labelTeam,
		normalizeGameState,
		type PhantomInkGameState,
		type Team,
	} from '@repo/shared/game';
	import {
		MAX_PLAYER_NAME_LENGTH,
		playerIdForUser,
		type OnlineRoomAction,
		type PlayerRole,
		type RoomDirectoryListing,
		type RoomMemberView,
		type RoomViewState,
	} from '@repo/shared/onlineGame';
	import {
		getCurrentRoom,
		getRoomDirectory,
		getStoredUserId,
		joinRoom,
		leaveRoomForStoredUser,
		openRoomEvents,
		sendRoomAction,
	} from '$lib/api';
	import InkButton from '$lib/InkButton.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import { createRoomCode, parseRoomCode } from '$lib/roomCodes';
	import { deleteStored, getDebugId, getStored, setStored, storageKeys } from '$lib/storage';

	type DebugPayload = PhantomInkGameState | { state: PhantomInkGameState } | string;

	const roleLabels: Record<PlayerRole, string> = {
		spirit: 'Spirit',
		medium: 'Medium',
		spectator: 'Spectator',
	};

	let playerName = $state(getStored(storageKeys.playerName));
	let joinCode = $state('');
	let roomCode = $state<string | null>(null);
	let room = $state<RoomViewState | null>(null);
	let directory = $state<RoomDirectoryListing[]>([]);
	let resumeRoomCode = $state<string | null>(null);
	let dismissedResumeRoom = $state<string | null>(null);
	let error = $state<string | null>(null);
	let isLoading = $state(false);
	let objectInput = $state('');
	let entryTeam = $state<Team>('sun');
	let entryRow = $state(1);
	let entryText = $state('');
	let finishWinner = $state<Team | 'none'>('none');
	let localSavedAt = $state(getStored(storageKeys.savedState)?.log[0]?.createdAt ?? null);
	let events: EventSource | null = null;
	let directoryTimer: number | null = null;

	const selfMember = $derived.by(() => {
		const currentRoom = room;
		return currentRoom ? (currentRoom.members.find(member => member.id === currentRoom.selfPlayerId) ?? null) : null;
	});
	const board = $derived(room?.gameState?.board ?? BOARD_TEMPLATE.map(row => ({ ...row, sun: '', moon: '' })));
	const hasLocalSave = $derived(Boolean(localSavedAt));
	const roomPlayers = $derived(room?.members.filter(member => member.role !== 'spectator') ?? []);
	const roomSpectators = $derived(room?.members.filter(member => member.role === 'spectator') ?? []);

	$effect(() => {
		setStored(storageKeys.playerName, playerName);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;

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
		const getState = () => (room?.gameState ? structuredClone(room.gameState) : null);
		const getRoom = () => (room ? structuredClone(room) : null);
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
		const initialRoom = parseRoomCode(new URLSearchParams(window.location.search).get('room'));
		if (initialRoom) {
			void enterRoom(initialRoom, { updateUrl: false });
		} else {
			void loadResumeRoom();
		}

		void refreshDirectory();
		directoryTimer = window.setInterval(() => void refreshDirectory(), 2500);
		const onPopState = () => {
			const nextRoom = parseRoomCode(new URLSearchParams(window.location.search).get('room'));
			if (nextRoom) {
				void enterRoom(nextRoom, { updateUrl: false });
			} else {
				closeEvents();
				roomCode = null;
				room = null;
			}
		};
		window.addEventListener('popstate', onPopState);

		return () => {
			closeEvents();
			if (directoryTimer !== null) window.clearInterval(directoryTimer);
			window.removeEventListener('popstate', onPopState);
		};
	});

	async function loadResumeRoom(): Promise<void> {
		const storedRoom = parseRoomCode(getStored(storageKeys.currentRoom));
		if (storedRoom && storedRoom !== dismissedResumeRoom) {
			resumeRoomCode = storedRoom;
			return;
		}

		try {
			const serverRoom = parseRoomCode(await getCurrentRoom());
			resumeRoomCode = serverRoom && serverRoom !== dismissedResumeRoom ? serverRoom : null;
		} catch {
			resumeRoomCode = null;
		}
	}

	async function refreshDirectory(): Promise<void> {
		try {
			directory = await getRoomDirectory();
		} catch {
			directory = [];
		}
	}

	async function createRoom(): Promise<void> {
		await enterRoom(createRoomCode());
	}

	async function joinTypedRoom(): Promise<void> {
		const code = parseRoomCode(joinCode);
		if (!code) {
			error = 'Room codes are 4 letters';
			return;
		}

		await enterRoom(code);
	}

	async function enterRoom(code: string, options: { updateUrl?: boolean } = {}): Promise<void> {
		const normalized = parseRoomCode(code);
		if (!normalized) {
			error = 'Room codes are 4 letters';
			return;
		}

		isLoading = true;
		error = null;
		closeEvents();
		roomCode = normalized;
		resumeRoomCode = null;
		if (options.updateUrl !== false) setUrlRoom(normalized);

		try {
			room = await joinRoom(normalized, playerName);
			events = openRoomEvents(
				normalized,
				nextRoom => {
					room = nextRoom;
					error = null;
				},
				() => {
					if (roomCode) void reconnectRoom(roomCode);
				},
			);
			void refreshDirectory();
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to join room';
		} finally {
			isLoading = false;
		}
	}

	async function reconnectRoom(code: string): Promise<void> {
		try {
			room = await joinRoom(code, playerName);
		} catch {
			error = 'Connection interrupted';
		}
	}

	async function leaveRoom(): Promise<void> {
		const code = roomCode;
		closeEvents();
		if (code) {
			await leaveRoomForStoredUser(code).catch(() => {});
		}
		roomCode = null;
		room = null;
		deleteStored(storageKeys.currentRoom);
		setUrlRoom(null);
		void loadResumeRoom();
		void refreshDirectory();
	}

	async function send(action: OnlineRoomAction): Promise<void> {
		if (!roomCode) return;

		try {
			room = await sendRoomAction(roomCode, action);
			error = null;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to update room';
		}
	}

	function actorId(): string | null {
		const userId = getStoredUserId();
		return userId ? playerIdForUser(userId) : (room?.selfPlayerId ?? null);
	}

	async function updateSeat(team: Team, role: PlayerRole): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({ type: 'set-seat', actorId: actor, team, role });
	}

	async function setReady(ready: boolean): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({ type: 'set-ready', actorId: actor, ready });
	}

	async function startGame(): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({ type: 'start-game', actorId: actor, object: objectInput });
		objectInput = '';
	}

	async function writeEntry(): Promise<void> {
		const actor = actorId();
		if (!actor || !entryText.trim()) return;

		await send({
			type: 'game-action',
			actorId: actor,
			action: { type: 'write-entry', team: entryTeam, row: entryRow, text: entryText },
		});
		entryText = '';
	}

	async function clearEntry(team: Team, row: number): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({ type: 'game-action', actorId: actor, action: { type: 'clear-entry', team, row } });
	}

	async function setActiveTeam(team: Team): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({ type: 'game-action', actorId: actor, action: { type: 'set-active-team', team } });
	}

	async function finishGame(): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({
			type: 'game-action',
			actorId: actor,
			action: {
				type: 'finish-game',
				winner: finishWinner === 'none' ? null : finishWinner,
				object: objectInput,
			},
		});
	}

	async function saveServerSnapshot(): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({ type: 'save-state', actorId: actor });
	}

	async function loadServerSnapshot(): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({ type: 'load-state', actorId: actor });
	}

	function saveLocalSnapshot(): void {
		if (!room?.gameState) return;

		const state = structuredClone(room.gameState);
		setStored(storageKeys.savedState, state);
		localSavedAt = state.log[0]?.createdAt ?? new Date().toISOString();
	}

	async function loadLocalSnapshot(): Promise<void> {
		const state = getStored(storageKeys.savedState);
		if (!state) return;

		await loadDebugState(state);
	}

	async function resetRoom(): Promise<void> {
		const actor = actorId();
		if (!actor) return;

		await send({ type: 'reset-room', actorId: actor });
	}

	async function loadDebugState(payload: DebugPayload): Promise<PhantomInkGameState> {
		const loaded = normalizeGameState(parseDebugPayload(payload));
		const actor = actorId();
		if (actor && roomCode) {
			await send({ type: 'load-state', actorId: actor, state: loaded });
		} else {
			setStored(storageKeys.savedState, loaded);
			localSavedAt = loaded.log[0]?.createdAt ?? new Date().toISOString();
		}

		return loaded;
	}

	function parseDebugPayload(payload: DebugPayload): PhantomInkGameState {
		const parsed =
			typeof payload === 'string'
				? (JSON.parse(payload) as PhantomInkGameState | { state: PhantomInkGameState })
				: payload;
		return (parsed as { state?: PhantomInkGameState }).state ?? (parsed as PhantomInkGameState);
	}

	function closeEvents(): void {
		events?.close();
		events = null;
	}

	function setUrlRoom(code: string | null): void {
		if (typeof window === 'undefined') return;

		const url = new URL(window.location.href);
		if (code) {
			url.searchParams.set('room', code);
		} else {
			url.searchParams.delete('room');
		}
		const debugId = getDebugId();
		if (debugId) url.searchParams.set('DEBUG_ID', debugId);
		window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
	}

	function memberSeatClass(member: RoomMemberView): string {
		return `member-row ${member.team} ${member.role}${member.id === room?.selfPlayerId ? ' self' : ''}`;
	}
</script>

<svelte:head>
	<title>Phantom Ink</title>
</svelte:head>

<section class="screen">
	<header class="screen-heading">
		<div>
			<p class="eyebrow">{roomCode ? `Room ${roomCode}` : 'Seance lobby'}</p>
			<h1>{roomCode ? 'Spirit pad' : 'Gather mediums'}</h1>
		</div>
		{#if getDebugId()}
			<span class="debug-pill">DEBUG_ID {getDebugId()}</span>
		{/if}
	</header>

	{#if error}
		<p class="notice error">{error}</p>
	{/if}

	{#if !roomCode}
		<section class="lobby-grid">
			<section class="panel logo-panel">
				<PhantomLogo />
				<div class="button-showcase" aria-label="Button states">
					<InkButton size="sm">Small</InkButton>
					<InkButton primary>Primary</InkButton>
					<InkButton size="lg">Large</InkButton>
					<InkButton primary disabled>Disabled</InkButton>
				</div>
			</section>

			<section class="panel lobby-panel">
				<div class="field">
					<label for="player-name">Name</label>
					<input
						id="player-name"
						bind:value={playerName}
						maxlength={MAX_PLAYER_NAME_LENGTH}
						autocomplete="nickname"
						spellcheck="false"
						placeholder="Player name"
					/>
				</div>

				<div class="button-row">
					<InkButton primary disabled={isLoading} onclick={() => void createRoom()}>Create Room</InkButton>
				</div>

				<form
					class="join-form"
					onsubmit={event => {
						event.preventDefault();
						void joinTypedRoom();
					}}
				>
					<input
						bind:value={joinCode}
						maxlength="4"
						inputmode="text"
						autocomplete="off"
						spellcheck="false"
						placeholder="ABCD"
					/>
					<InkButton type="submit" disabled={!parseRoomCode(joinCode)}>Join</InkButton>
				</form>

				{#if resumeRoomCode}
					<div class="resume-banner">
						<span>Room {resumeRoomCode}</span>
						<div class="button-row compact">
							<InkButton
								size="sm"
								onclick={() => {
									dismissedResumeRoom = resumeRoomCode;
									resumeRoomCode = null;
									deleteStored(storageKeys.currentRoom);
								}}
							>
								Dismiss
							</InkButton>
							<InkButton size="sm" primary onclick={() => resumeRoomCode && void enterRoom(resumeRoomCode)}>
								Resume
							</InkButton>
						</div>
					</div>
				{/if}
			</section>

			<section class="panel directory-panel">
				<div class="section-heading">
					<h2>Open Rooms</h2>
					<InkButton size="sm" onclick={() => void refreshDirectory()}>Refresh</InkButton>
				</div>
				{#if directory.length === 0}
					<p class="empty">No open rooms</p>
				{:else}
					<div class="room-list">
						{#each directory as listing}
							<button type="button" class="room-listing" onclick={() => void enterRoom(listing.code)}>
								<span class="room-code">{listing.code}</span>
								<span>{listing.players.length ? listing.players.join(', ') : 'Empty'}</span>
								<span class="phase">{listing.phase}</span>
							</button>
						{/each}
					</div>
				{/if}
			</section>
		</section>
	{:else if !room}
		<section class="panel loading-panel">
			<p>{isLoading ? 'Loading room...' : 'Room unavailable'}</p>
			<InkButton onclick={() => void leaveRoom()}>Back</InkButton>
		</section>
	{:else}
		<section class="room-layout">
			<aside class="panel room-sidebar">
				<div class="section-heading">
					<h2>Players</h2>
					<InkButton size="sm" onclick={() => void leaveRoom()}>Leave</InkButton>
				</div>

				{#if selfMember}
					<section class="seat-controls">
						<div class="segmented">
							<button
								type="button"
								class={selfMember.team === 'sun' ? 'active' : ''}
								onclick={() => void updateSeat('sun', selfMember.role)}
							>
								Sun
							</button>
							<button
								type="button"
								class={selfMember.team === 'moon' ? 'active' : ''}
								onclick={() => void updateSeat('moon', selfMember.role)}
							>
								Moon
							</button>
						</div>
						<div class="segmented role-grid">
							{#each Object.entries(roleLabels) as [role, label]}
								<button
									type="button"
									class={selfMember.role === role ? 'active' : ''}
									onclick={() => void updateSeat(selfMember.team, role as PlayerRole)}
								>
									{label}
								</button>
							{/each}
						</div>
						<button
							type="button"
							class="primary full-width"
							disabled={selfMember.role === 'spectator'}
							onclick={() => void setReady(!selfMember.isReady)}
						>
							{selfMember.isReady ? 'Unready' : 'Ready'}
						</button>
					</section>
				{/if}

				<div class="member-list">
					{#each roomPlayers as member}
						<article class={memberSeatClass(member)}>
							<div>
								<strong>{member.name}</strong>
								<span>{labelTeam(member.team)} {roleLabels[member.role]}</span>
							</div>
							{#if member.isReady}
								<span class="ready-pill">Ready</span>
							{/if}
						</article>
					{/each}
					{#each roomSpectators as member}
						<article class={memberSeatClass(member)}>
							<div>
								<strong>{member.name}</strong>
								<span>Spectator</span>
							</div>
						</article>
					{/each}
				</div>

				{#if room.phase === 'lobby'}
					<div class="start-box">
						<input bind:value={objectInput} placeholder="Object (private)" autocomplete="off" />
						<button type="button" class="primary full-width" disabled={!room.canStart} onclick={() => void startGame()}>
							Start
						</button>
						{#if room.startProblem}
							<p class="hint">{room.startProblem}</p>
						{/if}
					</div>
				{:else}
					<div class="start-box">
						<button type="button" class="subtle full-width" onclick={() => void resetRoom()}> Reset to Lobby </button>
					</div>
				{/if}
			</aside>

			<section class="main-stack">
				<section class="panel board-panel">
					<div class="section-heading">
						<h2>Pad</h2>
						<div class="segmented compact">
							<button
								type="button"
								class={room.gameState?.activeTeam === 'sun' ? 'active' : ''}
								onclick={() => void setActiveTeam('sun')}
							>
								Sun
							</button>
							<button
								type="button"
								class={room.gameState?.activeTeam === 'moon' ? 'active' : ''}
								onclick={() => void setActiveTeam('moon')}
							>
								Moon
							</button>
						</div>
					</div>

					<div class="board-grid">
						<div class="board-head sun">Sun</div>
						<div class="row-head">Row</div>
						<div class="board-head moon">Moon</div>
						{#each board as row}
							<button
								type="button"
								class="board-space sun"
								onclick={() => {
									entryTeam = 'sun';
									entryRow = row.row;
									entryText = row.sun;
								}}
							>
								{#if row.sunEye}<span class="eye">EYE</span>{/if}
								<span>{row.sun || '-'}</span>
							</button>
							<div class="row-number">{row.row}</div>
							<button
								type="button"
								class="board-space moon"
								onclick={() => {
									entryTeam = 'moon';
									entryRow = row.row;
									entryText = row.moon;
								}}
							>
								{#if row.moonEye}<span class="eye">EYE</span>{/if}
								<span>{row.moon || '-'}</span>
							</button>
						{/each}
					</div>
				</section>

				<section class="panel action-panel">
					<form
						class="entry-form"
						onsubmit={event => {
							event.preventDefault();
							void writeEntry();
						}}
					>
						<div class="segmented">
							<button type="button" class={entryTeam === 'sun' ? 'active' : ''} onclick={() => (entryTeam = 'sun')}>
								Sun
							</button>
							<button type="button" class={entryTeam === 'moon' ? 'active' : ''} onclick={() => (entryTeam = 'moon')}>
								Moon
							</button>
						</div>
						<select bind:value={entryRow} aria-label="Board row">
							{#each board as row}
								<option value={row.row}>Row {row.row}</option>
							{/each}
						</select>
						<input bind:value={entryText} maxlength="24" autocomplete="off" placeholder="Clue or guess" />
						<button type="submit" class="primary" disabled={!entryText.trim()}>Write</button>
						<button type="button" class="subtle" onclick={() => void clearEntry(entryTeam, entryRow)}> Clear </button>
					</form>
				</section>

				<section class="panel snapshot-panel">
					<div class="section-heading">
						<h2>Snapshots</h2>
						{#if localSavedAt}
							<span class="timestamp">{new Date(localSavedAt).toLocaleString()}</span>
						{/if}
					</div>
					<div class="button-row">
						<button type="button" class="subtle" disabled={!room.gameState} onclick={saveLocalSnapshot}>
							Save Local
						</button>
						<button type="button" class="subtle" disabled={!hasLocalSave} onclick={() => void loadLocalSnapshot()}>
							Load Local
						</button>
						<button type="button" class="subtle" disabled={!room.gameState} onclick={() => void saveServerSnapshot()}>
							Save Room
						</button>
						<button type="button" class="subtle" disabled={!room.savedState} onclick={() => void loadServerSnapshot()}>
							Load Room
						</button>
					</div>
					<div class="finish-row">
						<select bind:value={finishWinner} aria-label="Winner">
							<option value="none">No winner</option>
							<option value="sun">Sun wins</option>
							<option value="moon">Moon wins</option>
						</select>
						<input bind:value={objectInput} placeholder="Object" autocomplete="off" />
						<button type="button" class="subtle" disabled={!room.gameState} onclick={() => void finishGame()}>
							Finish
						</button>
					</div>
				</section>

				<section class="panel log-panel">
					<div class="section-heading">
						<h2>Log</h2>
						<span class="timestamp">v{room.snapshotVersion}</span>
					</div>
					{#if room.gameState?.log.length}
						<ul>
							{#each room.gameState.log as entry}
								<li>{entry.message}</li>
							{/each}
						</ul>
					{:else}
						<p class="empty">No game actions yet</p>
					{/if}
				</section>
			</section>
		</section>
	{/if}
</section>

<style>
	.screen {
		display: grid;
		gap: 0.85rem;
	}

	.screen-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.button-row,
	.finish-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.eyebrow {
		margin: 0 0 0.25rem;
		color: var(--app-muted);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		font-size: 1.8rem;
		line-height: 1.05;
	}

	h2 {
		font-size: 1rem;
		line-height: 1.2;
	}

	button,
	input,
	select {
		min-height: 2.5rem;
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		background: var(--app-input);
		color: var(--app-text);
		font: inherit;
	}

	button {
		padding: 0 0.85rem;
		font-weight: 700;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: var(--app-accent);
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	input,
	select {
		width: 100%;
		padding: 0 0.7rem;
	}

	label {
		color: var(--app-muted);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.primary {
		border-color: var(--app-accent);
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.subtle {
		background: transparent;
	}

	.full-width {
		width: 100%;
	}

	.panel {
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: var(--app-panel);
		color: var(--app-panel-text);
		padding: 1rem;
	}

	.lobby-grid,
	.room-layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}

	.logo-panel,
	.lobby-panel,
	.directory-panel,
	.room-sidebar,
	.main-stack,
	.seat-controls,
	.start-box {
		display: grid;
		gap: 1rem;
		align-content: start;
	}

	.logo-panel {
		justify-items: center;
		text-align: center;
	}

	.button-showcase {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.main-stack {
		grid-template-columns: minmax(0, 1fr);
	}

	.field {
		display: grid;
		gap: 0.4rem;
	}

	.join-form,
	.entry-form {
		display: grid;
		gap: 0.5rem;
	}

	.join-form {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.entry-form {
		grid-template-columns: 10rem 6.5rem minmax(10rem, 1fr) auto auto;
	}

	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.notice,
	.resume-banner {
		margin: 0;
	}

	.notice {
		border: 1px solid var(--app-error);
		border-radius: 0.5rem;
		background: var(--app-error-bg);
		color: var(--app-error);
		padding: 0.75rem 1rem;
	}

	.resume-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border: 1px solid var(--app-accent);
		border-radius: 0.5rem;
		background: var(--app-highlight);
		padding: 0.75rem;
		font-weight: 700;
	}

	.room-list {
		display: grid;
		gap: 0.5rem;
	}

	.room-listing {
		display: grid;
		grid-template-columns: 4.25rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		min-height: 3rem;
		text-align: left;
	}

	.room-code,
	.phase,
	.ready-pill,
	.debug-pill,
	.timestamp {
		border-radius: 999px;
		background: var(--app-chip);
		color: var(--app-chip-text);
		padding: 0.2rem 0.55rem;
		font-size: 0.75rem;
		font-weight: 800;
	}

	.debug-pill {
		border-radius: 0.375rem;
	}

	.member-list {
		display: grid;
		gap: 0.5rem;
	}

	.member-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 3.5rem;
		border: 1px solid var(--app-border);
		border-left-width: 0.35rem;
		border-radius: 0.5rem;
		padding: 0.65rem;
		background: var(--app-input);
	}

	.member-row.sun {
		border-left-color: var(--app-sun);
	}

	.member-row.moon {
		border-left-color: var(--app-moon);
	}

	.member-row.self {
		background: var(--app-highlight);
	}

	.member-row div,
	.member-row span {
		display: grid;
		gap: 0.2rem;
	}

	.member-row div span,
	.hint,
	.empty {
		color: var(--app-muted);
		font-size: 0.85rem;
		line-height: 1.45;
	}

	.segmented {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 0.35rem;
	}

	.segmented.compact {
		width: 11rem;
	}

	.segmented button.active {
		border-color: var(--app-accent);
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.role-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-auto-flow: initial;
	}

	.board-panel {
		overflow: auto;
	}

	.board-grid {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) 3rem minmax(12rem, 1fr);
		gap: 0.35rem;
		min-width: 32rem;
	}

	.board-head,
	.row-head,
	.row-number {
		display: grid;
		place-items: center;
		min-height: 2rem;
		color: var(--app-muted);
		font-size: 0.8rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	.board-space {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-height: 3.25rem;
		overflow: hidden;
		text-align: left;
	}

	.board-space span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.board-space.sun {
		border-left: 0.35rem solid var(--app-sun);
	}

	.board-space.moon {
		border-left: 0.35rem solid var(--app-moon);
	}

	.eye {
		flex: 0 0 auto;
		border: 1px solid var(--app-border);
		border-radius: 999px;
		color: var(--app-muted);
		padding: 0.1rem 0.35rem;
		font-size: 0.65rem;
		font-weight: 900;
	}

	.snapshot-panel,
	.log-panel {
		display: grid;
		gap: 0.75rem;
	}

	.log-panel ul {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding-left: 1.1rem;
		color: var(--app-muted);
	}

	.compact {
		gap: 0.35rem;
	}

	.loading-panel {
		display: grid;
		gap: 1rem;
		max-width: 24rem;
		margin: 3rem auto;
	}

	@media (max-width: 880px) {
		.entry-form {
			grid-template-columns: 1fr;
		}

		.segmented.compact {
			width: 100%;
		}
	}
</style>
