import {
	applyPhantomInkGameAction,
	createInitialGameState,
	normalizeGameState,
	type PhantomInkGameAction,
	type PhantomInkGameState,
	type Team,
} from './game';

export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYER_NAME_LENGTH = 24;
export const MIN_SEATED_PLAYER_COUNT = 4;
export const MAX_SEATED_PLAYER_COUNT = 12;

export type PlayerId = string;
export type RoomPhase = 'lobby' | 'playing';
export type PlayerRole = 'spirit' | 'medium' | 'spectator';

export interface RoomMember {
	id: PlayerId;
	userId: number;
	name: string;
	team: Team;
	role: PlayerRole;
}

export interface RoomMemberView extends RoomMember {
	isReady: boolean;
}

export interface OnlineRoomState {
	v: number;
	phase: RoomPhase;
	gameState: PhantomInkGameState | null;
	savedState: PhantomInkGameState | null;
	members: RoomMember[];
	readyPlayerIds: PlayerId[];
}

export type OnlineRoomAction =
	| { type: 'join'; actorId: PlayerId; userId: number; name: string }
	| { type: 'leave'; actorId: PlayerId }
	| { type: 'set-name'; actorId: PlayerId; name: string }
	| { type: 'set-seat'; actorId: PlayerId; team: Team; role: PlayerRole }
	| { type: 'set-ready'; actorId: PlayerId; ready: boolean }
	| { type: 'start-game'; actorId: PlayerId; object?: string | null }
	| { type: 'game-action'; actorId: PlayerId; action: PhantomInkGameAction }
	| { type: 'save-state'; actorId: PlayerId }
	| { type: 'load-state'; actorId: PlayerId; state?: PhantomInkGameState | null }
	| { type: 'reset-room'; actorId: PlayerId };

export interface RoomViewState {
	status: 'idle' | 'connecting' | 'connected';
	selfId: string | null;
	selfPlayerId: PlayerId | null;
	snapshotVersion: number;
	phase: RoomPhase;
	members: RoomMemberView[];
	gameState: PhantomInkGameState | null;
	savedState: PhantomInkGameState | null;
	canStart: boolean;
	startProblem: string | null;
}

export interface RoomDirectoryListing {
	code: string;
	players: string[];
	phase: RoomPhase;
}

export interface RoomResponse {
	room: RoomViewState;
}

export interface DirectoryResponse {
	rooms: RoomDirectoryListing[];
}

export interface CurrentRoomResponse {
	roomCode: string | null;
}

export interface UserRecord {
	id: number;
	name: string;
}

export interface UserResponse {
	user: UserRecord;
}

export function playerIdForUser(userId: number): PlayerId {
	return `player:${userId}`;
}

export function createInitialOnlineRoomState(): OnlineRoomState {
	return {
		v: 0,
		phase: 'lobby',
		gameState: null,
		savedState: null,
		members: [],
		readyPlayerIds: [],
	};
}

export function sanitizePlayerName(value: string): string | null {
	const trimmed = value.trim().replace(/\s+/g, ' ');
	return trimmed.length === 0 ? null : trimmed.slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function buildRoomMembers(
	members: readonly RoomMember[],
	readyPlayerIds: readonly PlayerId[] = [],
): RoomMemberView[] {
	const ready = new Set(uniquePlayerIds(readyPlayerIds, members));
	const usedNames = new Set<string>();

	return [...members]
		.sort((a, b) => a.userId - b.userId)
		.map((member, index) => {
			const baseName = sanitizePlayerName(member.name) ?? `Player ${String(index + 1).padStart(2, '0')}`;
			const name = disambiguatePlayerName(baseName, usedNames);
			usedNames.add(nameKey(name));
			return {
				...member,
				name,
				isReady: ready.has(member.id),
			};
		});
}

export function selectRoomDirectoryListings(
	rooms: ReadonlyArray<{ code: string; state: OnlineRoomState }>,
): RoomDirectoryListing[] {
	return rooms
		.map(room => ({
			code: room.code,
			players: buildRoomMembers(room.state.members, room.state.readyPlayerIds)
				.filter(member => member.role !== 'spectator')
				.map(member => member.name),
			phase: room.state.phase,
		}))
		.sort((a, b) => a.code.localeCompare(b.code));
}

export function selectRoomViewState(
	state: OnlineRoomState | null,
	selfUserId: number | null,
	status: RoomViewState['status'] = state ? 'connected' : 'idle',
): RoomViewState {
	const selfPlayerId = selfUserId === null ? null : playerIdForUser(selfUserId);
	const members = state ? buildRoomMembers(state.members, state.readyPlayerIds) : [];
	const startProblem = state ? getStartProblem(state) : 'Room is not loaded';

	return {
		status,
		selfId: selfUserId === null ? null : String(selfUserId),
		selfPlayerId,
		snapshotVersion: state?.v ?? 0,
		phase: state?.phase ?? 'lobby',
		members,
		gameState: state?.gameState ?? null,
		savedState: state?.savedState ?? null,
		canStart: startProblem === null,
		startProblem,
	};
}

export function applyOnlineRoomAction(state: OnlineRoomState, action: OnlineRoomAction): boolean {
	state.readyPlayerIds = uniquePlayerIds(state.readyPlayerIds, state.members);

	if (action.type === 'join') {
		if (action.actorId !== playerIdForUser(action.userId)) return false;

		const name = sanitizePlayerName(action.name) ?? `Player ${action.userId}`;
		const existing = state.members.find(member => member.userId === action.userId);
		if (existing) {
			if (existing.name === name) return false;
			existing.name = name;
			clearReady(state);
			return true;
		}

		state.members.push({
			id: action.actorId,
			userId: action.userId,
			name,
			...defaultSeatFor(state.members),
		});
		clearReady(state);
		return true;
	}

	const actor = state.members.find(member => member.id === action.actorId);
	if (!actor) return false;

	switch (action.type) {
		case 'leave':
			state.members = state.members.filter(member => member.id !== action.actorId);
			state.readyPlayerIds = state.readyPlayerIds.filter(id => id !== action.actorId);
			clearReady(state);
			return true;
		case 'set-name': {
			const name = sanitizePlayerName(action.name);
			if (!name || actor.name === name) return false;

			actor.name = name;
			clearReady(state);
			return true;
		}
		case 'set-seat':
			if (state.phase !== 'lobby') return false;
			if (actor.team === action.team && actor.role === action.role) return false;

			actor.team = action.team;
			actor.role = action.role;
			clearReady(state);
			return true;
		case 'set-ready': {
			if (state.phase !== 'lobby' || actor.role === 'spectator') return false;

			const wasReady = state.readyPlayerIds.includes(action.actorId);
			if (wasReady === action.ready) return false;

			state.readyPlayerIds = action.ready
				? uniquePlayerIds([...state.readyPlayerIds, action.actorId], state.members)
				: state.readyPlayerIds.filter(id => id !== action.actorId);
			maybeStartRoom(state);
			return true;
		}
		case 'start-game':
			if (state.phase !== 'lobby' || getStartProblem(state) !== null) return false;

			state.phase = 'playing';
			state.gameState = createInitialGameState({ object: action.object });
			state.readyPlayerIds = [];
			return true;
		case 'game-action':
			if (state.phase !== 'playing' || !state.gameState) return false;

			return applyPhantomInkGameAction(state.gameState, action.action);
		case 'save-state':
			if (!state.gameState) return false;

			state.savedState = structuredClone(state.gameState);
			return true;
		case 'load-state': {
			const nextState = action.state ?? state.savedState;
			if (!nextState) return false;

			state.phase = 'playing';
			state.gameState = normalizeGameState(structuredClone(nextState));
			return true;
		}
		case 'reset-room':
			state.phase = 'lobby';
			state.gameState = null;
			state.readyPlayerIds = [];
			return true;
	}
}

export function reduceOnlineRoomActions(actions: readonly OnlineRoomAction[]): OnlineRoomState {
	const state = createInitialOnlineRoomState();
	for (const action of actions) {
		if (applyOnlineRoomAction(state, action)) state.v += 1;
	}
	return state;
}

function getStartProblem(state: OnlineRoomState): string | null {
	if (state.phase !== 'lobby') return 'The room has already started';

	const seated = state.members.filter(member => member.role !== 'spectator');
	if (seated.length < MIN_SEATED_PLAYER_COUNT) return 'Need at least 4 seated players';
	if (seated.length > MAX_SEATED_PLAYER_COUNT) return 'Too many seated players';

	for (const team of ['sun', 'moon'] as const) {
		if (!seated.some(member => member.team === team && member.role === 'spirit')) {
			return `${team === 'sun' ? 'Sun' : 'Moon'} needs a Spirit`;
		}
		if (!seated.some(member => member.team === team && member.role === 'medium')) {
			return `${team === 'sun' ? 'Sun' : 'Moon'} needs a Medium`;
		}
	}

	return null;
}

function maybeStartRoom(state: OnlineRoomState): void {
	if (getStartProblem(state) !== null) return;
	const seated = state.members.filter(member => member.role !== 'spectator');
	if (!seated.every(member => state.readyPlayerIds.includes(member.id))) return;

	state.phase = 'playing';
	state.gameState = createInitialGameState();
	state.readyPlayerIds = [];
}

function clearReady(state: OnlineRoomState): void {
	state.readyPlayerIds = [];
}

function defaultSeatFor(members: readonly RoomMember[]): Pick<RoomMember, 'team' | 'role'> {
	const seats: Array<Pick<RoomMember, 'team' | 'role'>> = [
		{ team: 'sun', role: 'spirit' },
		{ team: 'moon', role: 'spirit' },
		{ team: 'sun', role: 'medium' },
		{ team: 'moon', role: 'medium' },
	];

	return (
		seats[members.length] ?? {
			team: members.length % 2 === 0 ? 'sun' : 'moon',
			role: 'medium',
		}
	);
}

function uniquePlayerIds(ids: readonly PlayerId[], members: readonly Pick<RoomMember, 'id'>[]): PlayerId[] {
	const validIds = new Set(members.map(member => member.id));
	return [...new Set(ids)].filter(id => validIds.has(id));
}

function nameKey(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function disambiguatePlayerName(baseName: string, used: Set<string>): string {
	const key = nameKey(baseName);
	if (!used.has(key)) return baseName;

	for (let suffix = 2; suffix < 100; suffix += 1) {
		const suffixText = ` ${suffix}`;
		const candidate = `${baseName.slice(0, Math.max(1, MAX_PLAYER_NAME_LENGTH - suffixText.length)).trimEnd()}${suffixText}`;
		if (!used.has(nameKey(candidate))) return candidate;
	}

	return `${baseName.slice(0, MAX_PLAYER_NAME_LENGTH - 1).trimEnd()}*`;
}
