export const TEAMS = ['sun', 'moon'] as const;

export type Team = (typeof TEAMS)[number];
export type GameStatus = 'setup' | 'playing' | 'complete';

export interface BoardTemplateRow {
	row: number;
	sunEye: boolean;
	moonEye: boolean;
	coopLetters: number;
}

export interface BoardRow extends BoardTemplateRow {
	sun: string;
	moon: string;
}

export interface GameLogEntry {
	id: number;
	type: 'start' | 'write' | 'clear' | 'turn' | 'finish' | 'load';
	message: string;
	createdAt: string;
}

export interface PhantomInkGameState {
	status: GameStatus;
	activeTeam: Team;
	object: string | null;
	winner: Team | null;
	board: BoardRow[];
	log: GameLogEntry[];
	nextLogId: number;
}

export type PhantomInkGameAction =
	| { type: 'start-game'; object?: string | null }
	| { type: 'write-entry'; team: Team; row: number; text: string }
	| { type: 'clear-entry'; team: Team; row: number }
	| { type: 'set-active-team'; team: Team }
	| { type: 'finish-game'; winner?: Team | null; object?: string | null }
	| { type: 'replace-state'; state: PhantomInkGameState };

export const BOARD_TEMPLATE: readonly BoardTemplateRow[] = [
	{ row: 1, sunEye: false, moonEye: false, coopLetters: 2 },
	{ row: 2, sunEye: false, moonEye: false, coopLetters: 2 },
	{ row: 3, sunEye: false, moonEye: true, coopLetters: 2 },
	{ row: 4, sunEye: true, moonEye: false, coopLetters: 3 },
	{ row: 5, sunEye: false, moonEye: true, coopLetters: 3 },
	{ row: 6, sunEye: true, moonEye: true, coopLetters: 4 },
	{ row: 7, sunEye: true, moonEye: false, coopLetters: 5 },
	{ row: 8, sunEye: false, moonEye: false, coopLetters: 5 },
];

export function createInitialBoard(): BoardRow[] {
	return BOARD_TEMPLATE.map(row => ({ ...row, sun: '', moon: '' }));
}

export function createInitialGameState(input: { object?: string | null } = {}): PhantomInkGameState {
	const object = sanitizeObject(input.object ?? null);
	const state: PhantomInkGameState = {
		status: 'playing',
		activeTeam: 'sun',
		object,
		winner: null,
		board: createInitialBoard(),
		log: [],
		nextLogId: 1,
	};
	pushLog(state, 'start', object ? `Game started with object "${object}".` : 'Game started.');
	return state;
}

export function normalizeGameState(input: PhantomInkGameState): PhantomInkGameState {
	const boardByRow = new Map(input.board.map(row => [row.row, row]));
	const board = BOARD_TEMPLATE.map(template => {
		const row = boardByRow.get(template.row);
		return {
			...template,
			sun: sanitizeBoardText(row?.sun ?? ''),
			moon: sanitizeBoardText(row?.moon ?? ''),
		};
	});
	const log = Array.isArray(input.log) ? input.log.slice(0, 100) : [];
	const nextLogId =
		Number.isInteger(input.nextLogId) && input.nextLogId > 0
			? input.nextLogId
			: Math.max(0, ...log.map(entry => entry.id)) + 1;

	return {
		status: input.status === 'complete' ? 'complete' : input.status === 'setup' ? 'setup' : 'playing',
		activeTeam: input.activeTeam === 'moon' ? 'moon' : 'sun',
		object: sanitizeObject(input.object),
		winner: input.winner === 'sun' || input.winner === 'moon' ? input.winner : null,
		board,
		log,
		nextLogId,
	};
}

export function applyPhantomInkGameAction(state: PhantomInkGameState, action: PhantomInkGameAction): boolean {
	switch (action.type) {
		case 'start-game': {
			const next = createInitialGameState({ object: action.object });
			Object.assign(state, next);
			return true;
		}
		case 'write-entry': {
			const row = state.board.find(candidate => candidate.row === action.row);
			if (!row) return false;

			const nextText = sanitizeBoardText(action.text);
			if (row[action.team] === nextText) return false;

			row[action.team] = nextText;
			state.status = state.status === 'setup' ? 'playing' : state.status;
			pushLog(state, 'write', `${labelTeam(action.team)} wrote ${nextText || 'an empty entry'} on row ${action.row}.`);
			return true;
		}
		case 'clear-entry': {
			const row = state.board.find(candidate => candidate.row === action.row);
			if (!row || !row[action.team]) return false;

			row[action.team] = '';
			pushLog(state, 'clear', `${labelTeam(action.team)} cleared row ${action.row}.`);
			return true;
		}
		case 'set-active-team':
			if (state.activeTeam === action.team) return false;
			state.activeTeam = action.team;
			pushLog(state, 'turn', `${labelTeam(action.team)} is active.`);
			return true;
		case 'finish-game': {
			state.status = 'complete';
			state.winner = action.winner === 'sun' || action.winner === 'moon' ? action.winner : null;
			const object = sanitizeObject(action.object ?? state.object);
			state.object = object;
			pushLog(
				state,
				'finish',
				state.winner
					? `${labelTeam(state.winner)} won${object ? ` with "${object}"` : ''}.`
					: `Game finished${object ? ` with "${object}"` : ''}.`,
			);
			return true;
		}
		case 'replace-state': {
			Object.assign(state, normalizeGameState(action.state));
			pushLog(state, 'load', 'Debug state loaded.');
			return true;
		}
	}
}

export function labelTeam(team: Team): string {
	return team === 'sun' ? 'Sun' : 'Moon';
}

export function sanitizeBoardText(value: string): string {
	return value
		.toUpperCase()
		.replace(/[^A-Z ]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 24);
}

export function sanitizeObject(value: string | null | undefined): string | null {
	const cleaned = value?.trim().replace(/\s+/g, ' ').slice(0, 48) ?? '';
	return cleaned.length > 0 ? cleaned : null;
}

function pushLog(state: PhantomInkGameState, type: GameLogEntry['type'], message: string): void {
	state.log.unshift({
		id: state.nextLogId,
		type,
		message,
		createdAt: new Date().toISOString(),
	});
	state.nextLogId += 1;
	state.log = state.log.slice(0, 30);
}
