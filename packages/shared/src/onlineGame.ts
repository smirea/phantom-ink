import {
	applyPhantomInkGameAction,
	createInitialGameState,
	normalizeGameState,
	type PhantomInkGameAction,
	type PhantomInkGameState,
	type Team,
} from './game';
import {
	DEFAULT_PLAYER_COLOR,
	DEFAULT_PLAYER_ICON,
	PLAYER_COLOR_PRESETS,
	PLAYER_ICON_PRESETS,
	type PlayerColorId,
	type PlayerIconId,
} from './playerProfile';
import type { User } from './db/schema';

export type { Team } from './game';
export type { User } from './db/schema';
export {
	DEFAULT_PLAYER_COLOR,
	DEFAULT_PLAYER_ICON,
	PLAYER_COLOR_PRESETS,
	PLAYER_ICON_PRESETS,
	type PlayerColorId,
	type PlayerIconId,
} from './playerProfile';

export const ROOM_CODE_LENGTH = 4;
export const MIN_PLAYER_NAME_LENGTH = 2;
export const MAX_PLAYER_NAME_LENGTH = 12;
export const MIN_SEATED_PLAYER_COUNT = 4;
export const MAX_SEATED_PLAYER_COUNT = 12;

export type PlayerId = string;
export type RoomPhase = 'lobby' | 'playing';
export type PlayerRole = 'spirit' | 'medium' | 'spectator';
export type WordMode = 'standard' | 'custom';

export interface RoomVote {
	playerId: PlayerId;
	action: RoomVoteActionName;
}

export type RoomVoteActionName = 'ready' | `word-mode:${WordMode}`;

export interface RoomVoteSummary {
	ns: RoomVoteNamespace;
	action: RoomVoteActionName;
	label: string;
	currentVotes: number;
	requiredVotes: number;
	voterIds: PlayerId[];
	missingPlayerIds: PlayerId[];
	eligiblePlayerIds: PlayerId[];
	consensus: boolean;
}

export type RoomVoteNamespace = 'ready' | 'word-mode';

export type RoomVoteAction =
	| { type: 'ready' }
	| {
			type: 'word-mode';
			mode: WordMode;
	  };

export interface RoomMember {
	id: PlayerId;
	userId: User['id'];
	name: User['name'];
	color: User['color'];
	icon: User['icon'];
	team: Team;
	role: PlayerRole;
}

export interface RoomMemberView extends RoomMember {
	isReady: boolean;
}

export interface OnlineRoomState {
	v: number;
	phase: RoomPhase;
	wordMode: WordMode;
	gameState: PhantomInkGameState | null;
	savedState: PhantomInkGameState | null;
	members: RoomMember[];
	readyPlayerIds: PlayerId[];
	votes: RoomVote[];
}

export type OnlineRoomAction =
	| {
			type: 'join';
			actorId: PlayerId;
			userId: User['id'];
			name: User['name'];
			color?: User['color'] | null;
			icon?: User['icon'] | null;
	  }
	| { type: 'leave'; actorId: PlayerId }
	| { type: 'set-name'; actorId: PlayerId; name: string }
	| { type: 'set-seat'; actorId: PlayerId; team: Team; role: PlayerRole }
	| { type: 'set-ready'; actorId: PlayerId; ready: boolean }
	| { type: 'vote'; actorId: PlayerId; vote: RoomVoteAction }
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
	wordMode: WordMode;
	members: RoomMemberView[];
	votes: RoomVoteSummary[];
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
	name: User['name'];
	color: User['color'];
	icon: User['icon'];
}

export function playerIdForUser(userId: User['id']): PlayerId {
	return `player:${userId}`;
}

export function createInitialOnlineRoomState(): OnlineRoomState {
	return {
		v: 0,
		phase: 'lobby',
		wordMode: 'standard',
		gameState: null,
		savedState: null,
		members: [],
		readyPlayerIds: [],
		votes: [],
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

export function sanitizeWordMode(value: string | null | undefined): WordMode {
	return value === 'custom' ? 'custom' : 'standard';
}

export function isCompleteUserProfile(user: User | null | undefined): user is User {
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
			const baseName = sanitizePlayerName(member.name) ?? `Soul ${String(index + 1).padStart(2, '0')}`;
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
	selfUserId: User['id'] | null,
	status: RoomViewState['status'] = state ? 'connected' : 'idle',
): RoomViewState {
	const selfPlayerId = selfUserId === null ? null : playerIdForUser(selfUserId);
	const votes = state ? selectRoomVoteSummaries(state) : [];
	const readyVote = votes.find(vote => vote.action === 'ready');
	const members = state ? buildRoomMembers(state.members, readyVote?.voterIds ?? state.readyPlayerIds) : [];
	const startProblem = state ? getStartProblem(state) : 'Room is not loaded';

	return {
		status,
		selfId: selfUserId === null ? null : String(selfUserId),
		selfPlayerId,
		snapshotVersion: state?.v ?? 0,
		phase: state?.phase ?? 'lobby',
		wordMode: sanitizeWordMode(state?.wordMode),
		members,
		votes,
		gameState: state?.gameState ?? null,
		savedState: state?.savedState ?? null,
		canStart: startProblem === null,
		startProblem,
	};
}

export function applyOnlineRoomAction(state: OnlineRoomState, action: OnlineRoomAction): boolean {
	normalizeOnlineRoomState(state);

	if (action.type === 'join') {
		if (action.actorId !== playerIdForUser(action.userId)) return false;

		const name = sanitizePlayerName(action.name) ?? `Soul ${action.userId}`;
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
			...(state.phase === 'lobby'
				? defaultSeatFor(state.members)
				: { team: leastPopulatedTeam(state.members), role: 'spectator' as const }),
		});
		clearReady(state);
		finalizeVotes(state);
		return true;
	}

	const actor = state.members.find(member => member.id === action.actorId);
	if (!actor) return false;

	switch (action.type) {
		case 'leave':
			state.members = state.members.filter(member => member.id !== action.actorId);
			state.readyPlayerIds = state.readyPlayerIds.filter(id => id !== action.actorId);
			state.votes = pruneVotes(state);
			clearReady(state);
			finalizeVotes(state);
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
			if (!isTeam(action.team) || !isPlayerRole(action.role) || action.role === 'spectator') return false;
			if (actor.team === action.team && actor.role === action.role) return false;

			actor.team = action.team;
			actor.role = action.role;
			clearReady(state);
			return true;
		case 'set-ready': {
			const hasReadyVote = state.votes.some(vote => vote.playerId === action.actorId && vote.action === 'ready');
			if (hasReadyVote === action.ready) return false;
			return applyVote(state, actor, 'ready');
		}
		case 'vote': {
			const voteAction = roomVoteActionName(action.vote);
			if (!voteAction) return false;
			return applyVote(state, actor, voteAction);
		}
		case 'start-game':
			if (state.phase !== 'lobby' || getStartProblem(state) !== null) return false;

			state.phase = 'playing';
			state.gameState = createInitialGameState({ object: action.object });
			state.readyPlayerIds = [];
			state.votes = [];
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
			state.votes = [];
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
	if (seated.length < MIN_SEATED_PLAYER_COUNT) return 'At least 4 souls needed';
	if (seated.length > MAX_SEATED_PLAYER_COUNT) return 'Too many seated souls';

	return null;
}

export function selectRoomVoteSummaries(state: OnlineRoomState): RoomVoteSummary[] {
	const normalizedState = normalizeOnlineRoomState(structuredClone(state));
	return [
		buildVoteSummary(normalizedState, 'ready', 'Ready'),
		buildVoteSummary(normalizedState, 'word-mode:standard', 'Standard words'),
		buildVoteSummary(normalizedState, 'word-mode:custom', 'Custom words'),
	];
}

function normalizeOnlineRoomState(state: OnlineRoomState): OnlineRoomState {
	state.wordMode = sanitizeWordMode(state.wordMode);
	state.readyPlayerIds = uniquePlayerIds(state.readyPlayerIds ?? [], state.members);
	state.votes = pruneVotes(state);
	return state;
}

function applyVote(state: OnlineRoomState, actor: RoomMember, action: RoomVoteActionName): boolean {
	const behavior = getVoteBehavior(state, action);
	if (!behavior || !behavior.voterIds.includes(actor.id)) return false;

	const existingVote = state.votes.find(vote => vote.playerId === actor.id && vote.action === action);
	if (existingVote) {
		state.votes = state.votes.filter(vote => !(vote.playerId === actor.id && vote.action === action));
		return true;
	}

	if (behavior.type === 'choice') {
		state.votes = state.votes.filter(
			vote => !(vote.playerId === actor.id && vote.action.startsWith(`${behavior.ns}:`)),
		);
	}

	state.votes.push({ playerId: actor.id, action });
	finalizeVotes(state);
	return true;
}

function finalizeVotes(state: OnlineRoomState): void {
	state.votes = pruneVotes(state);

	const wordMode = winningChoice(state, 'word-mode');
	if (wordMode) {
		const nextWordMode = sanitizeWordMode(wordMode.split(':')[1]);
		const changed = state.wordMode !== nextWordMode;
		state.wordMode = nextWordMode;
		state.votes = clearVoteNamespace(state.votes, 'word-mode');
		if (changed) clearReady(state);
	}

	const ready = buildVoteSummary(state, 'ready', 'Ready');
	if (ready.consensus && getStartProblem(state) === null) {
		state.phase = 'playing';
		state.gameState = createInitialGameState();
		state.readyPlayerIds = [];
		state.votes = [];
	}
}

function clearReady(state: OnlineRoomState): void {
	state.readyPlayerIds = [];
	state.votes = clearVoteNamespace(state.votes ?? [], 'ready');
}

function defaultSeatFor(members: readonly RoomMember[]): Pick<RoomMember, 'team' | 'role'> {
	return { team: leastPopulatedTeam(members), role: 'medium' };
}

function leastPopulatedTeam(members: readonly RoomMember[]): Team {
	const sunCount = members.filter(member => member.role !== 'spectator' && member.team === 'sun').length;
	const moonCount = members.filter(member => member.role !== 'spectator' && member.team === 'moon').length;
	return sunCount <= moonCount ? 'sun' : 'moon';
}

type VoteBehavior =
	| { ns: 'ready'; type: 'single'; voterIds: PlayerId[]; requiredVotes: number }
	| { ns: 'word-mode'; type: 'choice'; voterIds: PlayerId[]; requiredVotes: number };

function getVoteBehavior(state: OnlineRoomState, action: RoomVoteActionName): VoteBehavior | null {
	const voterIds = state.members.filter(member => member.role !== 'spectator').map(member => member.id);
	if (state.phase !== 'lobby' || voterIds.length === 0) return null;
	if (action === 'ready') return { ns: 'ready', type: 'single', voterIds, requiredVotes: voterIds.length };
	if (action.startsWith('word-mode:')) {
		return { ns: 'word-mode', type: 'choice', voterIds, requiredVotes: simpleMajority(voterIds.length) };
	}
	return null;
}

function buildVoteSummary(state: OnlineRoomState, action: RoomVoteActionName, label: string): RoomVoteSummary {
	const behavior = getVoteBehavior(state, action);
	const eligiblePlayerIds = behavior?.voterIds ?? [];
	const requiredVotes = behavior?.requiredVotes ?? eligiblePlayerIds.length;
	const voterIds = state.votes
		.filter(vote => vote.action === action && eligiblePlayerIds.includes(vote.playerId))
		.map(vote => vote.playerId);
	const uniqueVoterIds = [...new Set(voterIds)];
	return {
		ns: voteNamespace(action),
		action,
		label,
		currentVotes: uniqueVoterIds.length,
		requiredVotes,
		voterIds: uniqueVoterIds,
		missingPlayerIds: eligiblePlayerIds.filter(playerId => !uniqueVoterIds.includes(playerId)),
		eligiblePlayerIds,
		consensus: requiredVotes > 0 && uniqueVoterIds.length >= requiredVotes,
	};
}

function winningChoice(state: OnlineRoomState, ns: Extract<RoomVoteNamespace, 'word-mode'>): RoomVoteActionName | null {
	const behavior = getVoteBehavior(state, 'word-mode:standard');
	const eligiblePlayerIds = behavior?.voterIds ?? [];
	const requiredVotes = behavior?.requiredVotes ?? 0;
	if (!eligiblePlayerIds.length || requiredVotes === 0) return null;

	for (const action of [`${ns}:standard`, `${ns}:custom`] as RoomVoteActionName[]) {
		const votes = state.votes.filter(vote => vote.action === action && eligiblePlayerIds.includes(vote.playerId));
		if (new Set(votes.map(vote => vote.playerId)).size >= requiredVotes) return action;
	}

	return null;
}

function simpleMajority(total: number): number {
	return Math.floor(total / 2) + 1;
}

function pruneVotes(state: OnlineRoomState): RoomVote[] {
	const votes = Array.isArray(state.votes) ? state.votes : [];
	const validPlayers = new Set(state.members.map(member => member.id));
	const seen = new Set<string>();
	return votes.filter(vote => {
		if (!validPlayers.has(vote.playerId) || !isRoomVoteActionName(vote.action)) return false;
		const key = `${vote.playerId}:${vote.action}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function clearVoteNamespace(votes: readonly RoomVote[], ns: RoomVoteNamespace): RoomVote[] {
	return votes.filter(vote => voteNamespace(vote.action) !== ns);
}

function voteNamespace(action: RoomVoteActionName): RoomVoteNamespace {
	return action === 'ready' ? 'ready' : 'word-mode';
}

function roomVoteActionName(vote: RoomVoteAction): RoomVoteActionName | null {
	if (vote.type === 'ready') return 'ready';
	if (vote.type === 'word-mode') return `word-mode:${sanitizeWordMode(vote.mode)}`;
	return null;
}

function isRoomVoteActionName(value: unknown): value is RoomVoteActionName {
	return value === 'ready' || value === 'word-mode:standard' || value === 'word-mode:custom';
}

function isTeam(value: unknown): value is Team {
	return value === 'sun' || value === 'moon';
}

function isPlayerRole(value: unknown): value is PlayerRole {
	return value === 'spirit' || value === 'medium' || value === 'spectator';
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
