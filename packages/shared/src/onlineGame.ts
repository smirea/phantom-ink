import {
	applyPhantomInkGameAction,
	createInitialGameState,
	normalizeGameState,
	type PhantomInkGameAction,
	type PhantomInkGameState,
	type Team,
} from './game';

export const ROOM_CODE_LENGTH = 4;
export const MIN_PLAYER_NAME_LENGTH = 2;
export const MAX_PLAYER_NAME_LENGTH = 12;
export const MIN_SEATED_PLAYER_COUNT = 4;
export const MAX_SEATED_PLAYER_COUNT = 12;
export const PLAYER_COLOR_PRESETS = [
	{ id: 'ectoplasm', label: 'Ectoplasm', value: '#9ee6cf' },
	{ id: 'willowisp', label: 'Will-o-wisp', value: '#8ac7ff' },
	{ id: 'moonmilk', label: 'Moonmilk', value: '#d8d2ff' },
	{ id: 'haunt', label: 'Haunt', value: '#b990ff' },
	{ id: 'velvet', label: 'Velvet', value: '#d782ba' },
	{ id: 'bloodink', label: 'Blood ink', value: '#d85b68' },
	{ id: 'pumpkin', label: 'Pumpkin', value: '#e58a45' },
	{ id: 'brass', label: 'Brass', value: '#d0a45f' },
	{ id: 'moss', label: 'Moss', value: '#92b86d' },
	{ id: 'lagoon', label: 'Lagoon', value: '#55b7b2' },
	{ id: 'ash', label: 'Ash', value: '#a7a4ac' },
	{ id: 'bone', label: 'Bone', value: '#e3d7b8' },
] as const;
export const PLAYER_ICON_PRESETS = [
	{ id: 'ghost', label: 'Ghost' },
	{ id: 'skull', label: 'Skull' },
	{ id: 'venetian-mask', label: 'Mask' },
	{ id: 'drama', label: 'Drama' },
	{ id: 'cat', label: 'Cat' },
	{ id: 'rabbit', label: 'Rabbit' },
	{ id: 'rat', label: 'Rat' },
	{ id: 'snail', label: 'Snail' },
	{ id: 'bug', label: 'Bug' },
	{ id: 'worm', label: 'Worm' },
	{ id: 'fish', label: 'Fish' },
	{ id: 'angry', label: 'Grump' },
] as const;
export const DEFAULT_PLAYER_COLOR = PLAYER_COLOR_PRESETS[0].id;
export const DEFAULT_PLAYER_ICON = PLAYER_ICON_PRESETS[0].id;

export type PlayerId = string;
export type RoomPhase = 'lobby' | 'playing';
export type PlayerRole = 'spirit' | 'medium' | 'spectator';
export type PlayerColorId = (typeof PLAYER_COLOR_PRESETS)[number]['id'];
export type PlayerIconId = (typeof PLAYER_ICON_PRESETS)[number]['id'];

export interface RoomMember {
	id: PlayerId;
	userId: number;
	name: string;
	color: PlayerColorId;
	icon: PlayerIconId;
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
	| { type: 'join'; actorId: PlayerId; userId: number; name: string; color?: string | null; icon?: string | null }
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
	playerCount: number;
	players: RoomDirectoryPlayer[];
	phase: RoomPhase;
}

export interface RoomDirectoryPlayer {
	id: PlayerId;
	name: string;
	color: PlayerColorId;
	icon: PlayerIconId;
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
	color: PlayerColorId;
	icon: PlayerIconId;
}

export interface UserResponse {
	user: UserRecord;
}

export interface CurrentUserResponse {
	user: UserRecord | null;
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
	if (trimmed.length < MIN_PLAYER_NAME_LENGTH) return null;
	return trimmed.slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function isValidPlayerName(value: string): boolean {
	const trimmed = value.trim().replace(/\s+/g, ' ');
	return trimmed.length >= MIN_PLAYER_NAME_LENGTH && trimmed.length <= MAX_PLAYER_NAME_LENGTH;
}

export function sanitizePlayerColor(value: string | null | undefined): PlayerColorId {
	const color = PLAYER_COLOR_PRESETS.find(preset => preset.id === value);
	return color?.id ?? DEFAULT_PLAYER_COLOR;
}

export function sanitizePlayerIcon(value: string | null | undefined): PlayerIconId {
	const icon = PLAYER_ICON_PRESETS.find(preset => preset.id === value);
	return icon?.id ?? DEFAULT_PLAYER_ICON;
}

export function isCompleteUserProfile(user: UserRecord | null | undefined): user is UserRecord {
	return Boolean(user && isValidPlayerName(user.name));
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
				color: sanitizePlayerColor(member.color),
				icon: sanitizePlayerIcon(member.icon),
				isReady: ready.has(member.id),
			};
		});
}

export function selectRoomDirectoryListings(
	rooms: ReadonlyArray<{ code: string; state: OnlineRoomState }>,
): RoomDirectoryListing[] {
	return rooms
		.map(room => {
			const players = buildRoomMembers(room.state.members, room.state.readyPlayerIds)
				.filter(member => member.role !== 'spectator')
				.map(member => ({
					id: member.id,
					name: member.name,
					color: member.color,
					icon: member.icon,
				}));

			return {
				code: room.code,
				playerCount: players.length,
				players,
				phase: room.state.phase,
			};
		})
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
		const color = sanitizePlayerColor(action.color);
		const icon = sanitizePlayerIcon(action.icon);
		const existing = state.members.find(member => member.userId === action.userId);
		if (existing) {
			if (existing.name === name && existing.color === color && existing.icon === icon) return false;
			existing.name = name;
			existing.color = color;
			existing.icon = icon;
			clearReady(state);
			return true;
		}

		state.members.push({
			id: action.actorId,
			userId: action.userId,
			name,
			color,
			icon,
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
