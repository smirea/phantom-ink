import { range, sample, shuffle, uniq } from 'es-toolkit';
import { produce } from 'immer';
import { assign, createActor, enqueueActions, setup } from 'xstate';
import { board, questions, words, type QuestionCard, type WordCard } from './data';
import type { User } from './db/schema';
import { TEAMS, type Team } from './types';

export const gameStates = [
	'start',
	'setupWord',
	'mediumsTurn',
	'eyeHint',
	'mediumsAsk',
	'spiritAnswers',
	'mediumsGetClues',
	'guessing',
	'nextTurn',
	'win',
	'lose',
] as const;

export type GameState = (typeof gameStates)[number];

export type BoardEntry = {
	type: 'guess' | 'clue';
	value: string;
	fullValue?: string;
	hint?: string;
	questionId?: QuestionCard['id'];
	discardedQuestionId?: QuestionCard['id'];
};

export type KnownQuestion = { kind: 'used' | 'discarded'; question: QuestionCard };
export type VoteState = { voted: User['id'][]; eligible: User[]; required: number };
export type VoteOption = number | string;

export interface TeamState {
	spirit: User['id'];
	players: Array<User['id']>;
	questions: Array<QuestionCard['id']>;
	spiritQuestionPicks: Array<QuestionCard['id']>;
	board: BoardEntry[];
}

export interface GameContext {
	seed: string | null;
	currentTeam: Team;
	wordCardId: WordCard['id'];
	word: string;
	discardedQuestionsDeck: Array<QuestionCard['id']>;
	teams: Record<Team, TeamState>;
	voting: Partial<Record<VoteType, Partial<Record<User['id'], VoteOption[]>>>>;
}

export type GameEvent =
	| { type: 'start' }
	| { type: 'pickWord'; word: string }
	| { type: 'eyeHint' }
	| { type: 'pickHint'; clueId: string }
	| { type: 'guess' }
	| { type: 'guessLetter'; letter: string }
	| { type: 'ask' }
	| { type: 'pickQuestions'; questionIds: [QuestionCard['id'], QuestionCard['id']] }
	| { type: 'answer'; questionId: QuestionCard['id']; clue: string }
	| { type: 'silencio' }
	| { type: 'getClue' }
	| { type: 'vote'; action: VoteType; option: VoteOption; userId: User['id'] }
	| { type: 'debugSetState'; state: GameState; team: Team }
	| { type: 'debugSetTeam'; state: GameState; team: Team };

export type VoteType = 'pickWord' | 'mediumAction' | 'pickQuestions' | 'clue' | 'guessLetter' | 'pickHint';

export type VoteConfig = {
	activeState: GameState;
	mode: 'anySpirit' | 'activeMedium';
	count: number;
	choices: (ctx: GameContext) => VoteOption[];
	event: (ctx: GameContext, options: VoteOption[]) => GameEvent | null;
};

export const teams = TEAMS;

export const gameConfig = {
	questionsInHand: 7,
	questionsGivenToSpirit: 2,
	keyboardRows: ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), 'ZXCVBNM'.split(''), [' ']],
	runes: 'ᚡᚢᚣᚤᚥᚦᚧᚩᚫᚭᚮᚯᚱᚲᚳᚴᚵᚶᚷᚸᚹᚺᚻᚼᚽᚾᚿᛀᛁᛂᛃᛄᛅᛆᛇᛈᛉᛊᛋᛏᛐᛑᛒᛓᛔᛗᛘᛙᛚᛛᛜᛝᛞᛟᛠᛡᛢᛣᛤᛥᛦᛨᛩᛪ'.split(''),
} as const;

export const votingConfig = {
	pickWord: {
		activeState: 'setupWord',
		mode: 'anySpirit',
		count: 1,
		choices: (ctx: GameContext) => range(wordCard(ctx).words.length),
		event: (ctx: GameContext, [option]: VoteOption[]) =>
			typeof option === 'number' ? { type: 'pickWord', word: wordCard(ctx).words[option] } : null,
	},
	mediumAction: {
		activeState: 'mediumsTurn',
		mode: 'activeMedium',
		count: 1,
		choices: (ctx: GameContext) => (hasEyeHint(ctx) ? ['ask', 'eyeHint', 'guess'] : ['ask', 'guess']),
		event: (_ctx: GameContext, [option]: VoteOption[]) =>
			option === 'ask' || option === 'guess' || option === 'eyeHint' ? { type: option } : null,
	},
	pickQuestions: {
		activeState: 'mediumsAsk',
		mode: 'activeMedium',
		count: gameConfig.questionsGivenToSpirit,
		choices: (ctx: GameContext) => range(ctx.teams[ctx.currentTeam].questions.length),
		event: (ctx: GameContext, options: VoteOption[]) => {
			const team = ctx.teams[ctx.currentTeam];
			const questionIds = options
				.filter((value): value is number => typeof value === 'number')
				.map(index => team.questions[index])
				.filter((id): id is QuestionCard['id'] => Boolean(id));
			const [first, second] = questionIds;
			return first !== undefined && second !== undefined
				? { type: 'pickQuestions', questionIds: [first, second] }
				: null;
		},
	},
	clue: {
		activeState: 'mediumsGetClues',
		mode: 'activeMedium',
		count: 1,
		choices: (_ctx: GameContext) => ['getClue', 'silencio'],
		event: (_ctx: GameContext, [option]: VoteOption[]) =>
			option === 'getClue' || option === 'silencio' ? { type: option } : null,
	},
	guessLetter: {
		activeState: 'guessing',
		mode: 'activeMedium',
		count: 1,
		choices: (_ctx: GameContext) => gameConfig.keyboardRows.flat(),
		event: (_ctx: GameContext, [option]: VoteOption[]) =>
			typeof option === 'string' ? { type: 'guessLetter', letter: option } : null,
	},
	pickHint: {
		activeState: 'eyeHint',
		mode: 'activeMedium',
		count: 1,
		choices: revealableClueIds,
		event: (_ctx: GameContext, [option]: VoteOption[]) =>
			typeof option === 'string' ? { type: 'pickHint', clueId: option } : null,
	},
} satisfies Record<VoteType, VoteConfig>;

export const gameMachine = setup({
	types: {
		context: {} as GameContext,
		events: {} as GameEvent,
	},
	actions: {
		setupGame: assign(() => createInitialContext()),
		setWord: assign(({ event }) => {
			if (event.type !== 'pickWord') return {};
			return { currentTeam: 'sun' as Team, word: sanitizePhrase(event.word) };
		}),
		drawQuestionHand: assign(({ context }) => drawQuestionHand(context)),
		pickQuestions: assign(({ context, event }) => {
			if (event.type !== 'pickQuestions') return {};
			const picked = event.questionIds.slice(0, gameConfig.questionsGivenToSpirit);
			return produce(context, draft => {
				const team = draft.teams[draft.currentTeam];
				team.questions = team.questions.filter(id => !picked.includes(id));
				team.spiritQuestionPicks = picked;
			});
		}),
		answerQuestion: assign(({ context, event }) => {
			if (event.type !== 'answer') return {};
			return produce(context, draft => {
				const teamKey = draft.currentTeam;
				const team = draft.teams[teamKey];
				const questionId = team.spiritQuestionPicks.includes(event.questionId)
					? event.questionId
					: team.spiritQuestionPicks[0];
				if (!questionId) return;
				const discardedQuestionId = team.spiritQuestionPicks.find(id => id !== questionId);

				team.board.push({
					type: 'clue',
					value: '',
					fullValue: sanitizePhrase(event.clue),
					questionId,
					discardedQuestionId,
				});
				draft.discardedQuestionsDeck = uniq([...draft.discardedQuestionsDeck, ...team.spiritQuestionPicks]);
				team.spiritQuestionPicks = [];
			});
		}),
		giveEyeHint: assign(({ context, event }) => {
			if (event.type !== 'pickHint') return {};
			const row = context.teams[context.currentTeam].board.length;
			return revealClue(context, event.clueId, boardEntryId(context.currentTeam, row));
		}),
		giveNextLetterClue: assign(({ context }) => {
			const clue = getCurrentClue(context);
			const index = context.teams[context.currentTeam].board.length - 1;
			return clue ? revealClue(context, boardEntryId(context.currentTeam, index)) : {};
		}),
		startGuess: assign(({ context }) => {
			const teamKey = context.currentTeam;
			const team = context.teams[teamKey];
			if (team.board.length >= board.turns) return {};
			const entry: BoardEntry = {
				type: 'guess',
				value: '',
			};
			return produce(context, draft => {
				draft.teams[teamKey].board.push(entry);
			});
		}),
		recordGuessLetter: assign(({ context, event }) => {
			if (event.type !== 'guessLetter') return {};
			return updateLastGuess(context, event.letter);
		}),
		recordVote: enqueueActions(({ self, context, event, enqueue }) => {
			if (event.type !== 'vote') return;

			const state = self.getSnapshot().value as GameState;
			const nextContext = toggleVote(state, context, event.action, event.userId, event.option);
			if (nextContext === context) return;

			const nextEvent = consensusEvent(state, nextContext, event.action);
			enqueue.assign(() => {
				if (!nextEvent) return nextContext;

				return produce(nextContext, draft => {
					delete draft.voting[event.action];
				});
			});
			if (nextEvent) enqueue.raise(nextEvent);
		}),
		setupNextTurn: assign(({ context }) => ({
			currentTeam: context.currentTeam === 'sun' ? 'moon' : 'sun',
		})),
		debugSetTeam: assign(({ context, event }) => {
			if (event.type !== 'debugSetState' && event.type !== 'debugSetTeam') return {};
			const next = { ...context, currentTeam: event.team };
			return event.type === 'debugSetState' && event.state === 'mediumsAsk' ? drawQuestionHand(next) : next;
		}),
	},
}).createMachine({
	id: 'phantomInk',
	context: createInitialContext(),
	initial: 'start',
	on: {
		start: { target: '.setupWord', actions: 'setupGame' },
		vote: { actions: 'recordVote' },
		debugSetTeam: { actions: 'debugSetTeam' },
		debugSetState: gameStates.map(state => ({
			guard: ({ event }) => event.type === 'debugSetState' && event.state === state,
			target: `.${state}`,
			actions: 'debugSetTeam',
		})),
	},
	states: {
		start: {},
		setupWord: {
			on: {
				pickWord: { target: 'mediumsTurn', actions: 'setWord' },
			},
		},
		mediumsTurn: {
			entry: 'drawQuestionHand',
			on: {
				eyeHint: { guard: ({ context }) => hasEyeHint(context), target: 'eyeHint' },
				guess: 'guessing',
				ask: 'mediumsAsk',
			},
		},
		eyeHint: {
			on: {
				pickHint: { target: 'mediumsTurn', actions: 'giveEyeHint' },
			},
		},
		guessing: {
			entry: 'startGuess',
			on: {
				guessLetter: [
					{
						guard: ({ context, event }) =>
							event.type === 'guessLetter' && nextGuess(context, event.letter).value === context.word,
						target: 'win',
						actions: 'recordGuessLetter',
					},
					{
						guard: ({ context, event }) => event.type === 'guessLetter' && !nextGuess(context, event.letter).valid,
						target: 'nextTurn',
						actions: 'recordGuessLetter',
					},
					{ actions: 'recordGuessLetter' },
				],
			},
		},
		mediumsAsk: {
			on: {
				pickQuestions: { target: 'spiritAnswers', actions: 'pickQuestions' },
			},
		},
		spiritAnswers: {
			on: {
				answer: { target: 'mediumsGetClues', actions: 'answerQuestion' },
			},
		},
		mediumsGetClues: {
			always: {
				guard: ({ context }) => {
					const clue = getCurrentClue(context);
					return !clue || isBoardEntryDone(context, clue);
				},
				target: 'nextTurn',
			},
			on: {
				getClue: {
					guard: ({ context }) => {
						const clue = getCurrentClue(context);
						return Boolean(clue && !isBoardEntryDone(context, clue));
					},
					actions: 'giveNextLetterClue',
				},
				silencio: 'nextTurn',
			},
		},
		nextTurn: {
			entry: 'setupNextTurn',
			always: [
				{
					guard: ({ context }) =>
						context.teams.sun.board.length < board.turns || context.teams.moon.board.length < board.turns,
					target: 'mediumsTurn',
				},
				{ target: 'lose' },
			],
		},
		win: {},
		lose: {},
	},
});

export function createInitialContext({
	playersByTeam = { sun: [0, 1, 2], moon: [3, 4, 5] },
	spiritByTeam = {},
	wordCardId,
	seed,
}: {
	playersByTeam?: Record<Team, Array<User['id']>>;
	spiritByTeam?: Partial<Record<Team, User['id']>>;
	wordCardId?: WordCard['id'];
	seed?: string;
} = {}): GameContext {
	return {
		seed: seed ?? null,
		currentTeam: 'sun',
		wordCardId: wordCardId ?? (seed ? seededItem(words, `${seed}:word`).id : sample(words).id),
		word: '',
		discardedQuestionsDeck: [],
		teams: {
			sun: createTeamState(playersByTeam.sun, spiritByTeam.sun, seed ? `${seed}:sun` : undefined),
			moon: createTeamState(playersByTeam.moon, spiritByTeam.moon, seed ? `${seed}:moon` : undefined),
		},
		voting: {},
	};
}

export function createTeamState(
	players: Array<User['id']>,
	spirit?: User['id'],
	seed?: string,
	boardEntries: BoardEntry[] = [],
): TeamState {
	return {
		spirit: spirit ?? (seed ? seededItem(players, `${seed}:spirit`) : sample(players)),
		players,
		questions: [],
		spiritQuestionPicks: [],
		board: boardEntries,
	};
}

export function wordCard(context: GameContext): WordCard {
	return words.find(card => card.id === context.wordCardId)!;
}

export function drawQuestionHand(context: GameContext): GameContext {
	const team = context.teams[context.currentTeam];
	const needed = gameConfig.questionsInHand - team.questions.length;
	if (needed <= 0) return context;

	const handIds = new Set([...context.teams.sun.questions, ...context.teams.moon.questions]);
	let discardedQuestionsDeck = context.discardedQuestionsDeck;
	let available = questions.filter(
		question => !handIds.has(question.id) && !discardedQuestionsDeck.includes(question.id),
	);

	if (available.length < needed) {
		discardedQuestionsDeck = [];
		available = questions.filter(question => !handIds.has(question.id));
	}

	const drawn = (
		context.seed ? seededShuffle(available, `${context.seed}:questions:${drawKey(context)}`) : shuffle(available)
	)
		.slice(0, needed)
		.map(question => question.id);

	return produce(context, draft => {
		draft.discardedQuestionsDeck = discardedQuestionsDeck;
		draft.teams[draft.currentTeam].questions.push(...drawn);
	});
}

export function canSeeVote(state: GameState, voteId: VoteType): boolean {
	return votingConfig[voteId].activeState === state;
}

export function canVote(state: GameState, ctx: GameContext, voteId: VoteType, id: User['id']): boolean {
	if (!canSeeVote(state, voteId)) return false;

	if (votingConfig[voteId].mode === 'anySpirit') {
		const team = ctx.teams.sun.players.includes(id) ? ctx.teams.sun : ctx.teams.moon;
		return team.spirit === id;
	}

	const team = ctx.teams[ctx.currentTeam];
	return team.players.includes(id) && team.spirit !== id;
}

export function toggleVote<V extends VoteType>(
	s: GameState,
	context: GameContext,
	v: V,
	userId: User['id'],
	option: VoteOption,
): GameContext {
	const voteConfig = votingConfig[v];
	const choices: VoteOption[] = voteConfig.choices(context);
	if (!canVote(s, context, v, userId) || !choices.includes(option)) return context;

	return produce(context, draft => {
		const votes = (draft.voting[v] ??= {}) as Partial<Record<User['id'], VoteOption[]>>;
		const current = votes[userId] ?? [];
		const voted = current.includes(option)
			? current.filter(item => item !== option)
			: [...current, option].slice(-voteConfig.count);
		if (voted.length) {
			votes[userId] = voted;
		} else {
			delete votes[userId];
		}

		if (!Object.keys(votes).length) {
			delete draft.voting[v];
		}
	});
}

export function revealClue(context: GameContext, clueId: string, hint?: string): GameContext {
	const clue = parseBoardEntryId(clueId);
	if (!clue) return context;

	return produce(context, draft => {
		const entry = draft.teams[clue.team].board[clue.index];
		if (!entry || entry.type !== 'clue' || entry.fullValue === undefined) return;

		if (entry.value.length < entry.fullValue.length) {
			entry.value = entry.fullValue.slice(0, entry.value.length + 1);
		} else if (entry.value === entry.fullValue) {
			entry.value = clueDoneValue(entry);
		}
		entry.hint = hint ?? entry.hint;
	});
}

export function updateLastGuess(context: GameContext, letter: string): GameContext {
	const nextLetter = sanitizeGuessLetter(letter);
	if (!nextLetter) return context;

	return produce(context, draft => {
		const entry = draft.teams[draft.currentTeam].board.at(-1);
		if (!entry || entry.type !== 'guess') return;

		const value = `${entry.value}${nextLetter}`;
		entry.value = value;
	});
}

export function nextGuess(context: GameContext, letter: string): { value: string; valid: boolean } {
	const entry = context.teams[context.currentTeam].board.at(-1);
	const value = `${entry?.type === 'guess' ? entry.value : ''}${sanitizeGuessLetter(letter)}`;
	return { value, valid: Boolean(value) && context.word.startsWith(value) };
}

export function getCurrentClue(context: GameContext): BoardEntry | null {
	const entry = context.teams[context.currentTeam].board.at(-1);
	return entry?.type === 'clue' ? entry : null;
}

export function isBoardEntryDone(context: GameContext, entry: BoardEntry | undefined): boolean {
	if (!entry) return false;
	return entry.type === 'guess'
		? entry.value === context.word
		: entry.fullValue !== undefined && entry.value === clueDoneValue(entry);
}

function clueDoneValue(entry: BoardEntry): string {
	return `${entry.fullValue ?? ''}.`;
}

export function revealableClueIds(context: GameContext): string[] {
	return teams.flatMap(team =>
		context.teams[team].board.flatMap((entry, index) =>
			entry.type === 'clue' && !isBoardEntryDone(context, entry) ? [boardEntryId(team, index)] : [],
		),
	);
}

export function hasEyeHint(context: GameContext): boolean {
	const team = context.currentTeam;
	const row = context.teams[team].board.length;
	const hint = boardEntryId(team, row);
	return (
		board[team].hints.includes(row) &&
		!teams.some(team => context.teams[team].board.some(entry => entry.hint === hint)) &&
		revealableClueIds(context).length > 0
	);
}

export function consensusEvent(state: GameState, context: GameContext, action: VoteType): GameEvent | null {
	const options = consensusOptions(state, context, action);
	return options.length === votingConfig[action].count ? votingConfig[action].event(context, options) : null;
}

export function optionVoteState(
	s: GameState,
	context: GameContext,
	action: VoteType,
	option: VoteOption,
	playerData: User[],
): VoteState {
	const selected = context.voting[action] ?? {};
	const eligible = playerData.filter(user => canVote(s, context, action, user.id));
	const voted = eligible.filter(user => selected[user.id]?.includes(option)).map(user => user.id);
	return { voted, eligible, required: eligible.length };
}

export function consensusOptions(s: GameState, context: GameContext, action: VoteType): VoteOption[] {
	const voteConfig = votingConfig[action];
	const eligible = eligiblePlayerIds(s, context, action);
	if (!eligible.length) return [];

	const selected = context.voting[action] ?? {};
	if (eligible.some(userId => (selected[userId]?.length ?? 0) < voteConfig.count)) return [];

	const counts = new Map<VoteOption, number>();
	for (const userId of eligible) {
		for (const option of selected[userId] ?? []) {
			counts.set(option, (counts.get(option) ?? 0) + 1);
		}
	}

	return votingConfig[action]
		.choices(context)
		.filter(option => counts.get(option) === eligible.length)
		.slice(0, voteConfig.count);
}

function eligiblePlayerIds(s: GameState, context: GameContext, action: VoteType): Array<User['id']> {
	return teams.flatMap(team => context.teams[team].players).filter(userId => canVote(s, context, action, userId));
}

export function voteLabel(option: VoteOption): string {
	if (option === ' ') return 'Space';
	return String(option).replace(/^\w/, match => match.toUpperCase());
}

export function canAnswerSpirit(context: GameContext, id: User['id']): boolean {
	return context.teams[context.currentTeam].spirit === id;
}

export function playerTeam(context: GameContext, id: User['id']): Team {
	return context.teams.sun.players.includes(id) ? 'sun' : 'moon';
}

export function boardEntryId(team: Team, index: number): string {
	return `${team}:${index}`;
}

export function parseBoardEntryId(id: string): { team: Team; index: number } | null {
	const [team, index] = id.split(':');
	if ((team !== 'sun' && team !== 'moon') || index === undefined) return null;

	const parsed = Number(index);
	return Number.isInteger(parsed) ? { team, index: parsed } : null;
}

export function sanitizePhrase(value: string): string {
	return value
		.toUpperCase()
		.replace(/[^A-Z ]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function sanitizeGuessLetter(value: string): string {
	return value
		.toUpperCase()
		.replace(/[^A-Z ]/g, '')
		.slice(0, 1);
}

export function seededNumber(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function seededItem<T>(items: readonly T[], seed: string): T {
	return items[seededNumber(seed) % items.length]!;
}

export interface PhantomInkGameState {
	state: GameState;
	context: GameContext;
}

export type PhantomInkGameAction = GameEvent;

export function createInitialGameState(input: Parameters<typeof createInitialContext>[0] = {}): PhantomInkGameState {
	return {
		state: 'setupWord',
		context: createInitialContext(input),
	};
}

export function applyPhantomInkGameAction(state: PhantomInkGameState, action: PhantomInkGameAction): boolean {
	if (action.type === 'start' || action.type === 'debugSetState' || action.type === 'debugSetTeam') return false;

	const before = JSON.stringify(state);
	const actor = createActor(gameMachine, { snapshot: persistedSnapshot(state) });
	actor.start();
	actor.send(action);

	const snapshot = actor.getSnapshot();
	state.state = snapshot.value as GameState;
	state.context = structuredClone(snapshot.context);
	actor.stop();

	return before !== JSON.stringify(state);
}

function drawKey(context: GameContext): string {
	return [
		context.currentTeam,
		context.teams[context.currentTeam].board.length,
		context.teams[context.currentTeam].questions.join(','),
		context.discardedQuestionsDeck.join(','),
	].join(':');
}

function seededShuffle<T>(items: readonly T[], seed: string): T[] {
	return items
		.map((item, index) => ({ item, order: seededNumber(`${seed}:${index}`) }))
		.sort((a, b) => a.order - b.order)
		.map(entry => entry.item);
}

function persistedSnapshot(state: PhantomInkGameState) {
	return {
		status: 'active' as const,
		output: undefined,
		error: undefined,
		value: state.state,
		historyValue: {},
		context: structuredClone(state.context),
		children: {},
	};
}
