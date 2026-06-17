<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import { Eye, X } from '@lucide/svelte';
	import { board, questions, words, type QuestionCard, type WordCard } from '@repo/shared/data';
	import type { UserRecord } from '@repo/shared/onlineGame';
	import { range, sample, shuffle, uniq } from 'es-toolkit';
	import { onDestroy } from 'svelte';
	import { assign, createActor, setup } from 'xstate';

	type Team = 'sun' | 'moon';
	type ViewMode = 'act' | 'watch' | 'wait';
	type RelativeActor = 'currentSpirit' | 'otherSpirit' | 'currentMediums' | 'otherMediums';
	type NoteRow = { id: string; topic: string; note: string };

	const gameStates = [
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

	type GameState = (typeof gameStates)[number];
	type ActorKey = 'sunSpirit' | 'moonSpirit' | 'sunMediums' | 'moonMediums';

	type BoardEntry = {
		id: string;
		type: 'guess' | 'hint';
		value: string;
		fullValue?: string;
		revealed?: number;
		done?: boolean;
		invalid?: boolean;
		questionId?: QuestionCard['id'];
	};

	interface TeamState {
		spirit: UserRecord['id'];
		players: Array<UserRecord['id']>;
		questions: Array<QuestionCard['id']>;
		spiritQuestionCurrent: null | QuestionCard['id'];
		spiritQuestionPicks: Array<QuestionCard['id']>;
		spiritQuestionDiscards: Array<QuestionCard['id']>;
		eyeUsedRows: number[];
		board: BoardEntry[];
	}

	interface GameContext {
		currentTeam: Team;
		wordCard: WordCard;
		word: string;
		debugHold: boolean;
		discardedQuestionsDeck: Array<QuestionCard['id']>;
		teams: Record<Team, TeamState>;
		votes: Array<Record<string, never>>;
	}

	type GameEvent =
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
		| { type: 'debugSetState'; state: GameState; team: Team }
		| { type: 'debugSetTeam'; state: GameState; team: Team };

	const teams = ['sun', 'moon'] as const;
	const actors = ['sunSpirit', 'moonSpirit', 'sunMediums', 'moonMediums'] as const;
	const turns = range(board.turns);
	const roleRows: Array<Record<RelativeActor, ViewMode> & { state: GameState }> = [
		{ state: 'start', currentSpirit: 'wait', otherSpirit: 'wait', currentMediums: 'wait', otherMediums: 'wait' },
		{ state: 'setupWord', currentSpirit: 'act', otherSpirit: 'act', currentMediums: 'watch', otherMediums: 'watch' },
		{
			state: 'mediumsTurn',
			currentSpirit: 'watch',
			otherSpirit: 'watch',
			currentMediums: 'act',
			otherMediums: 'watch',
		},
		{ state: 'eyeHint', currentSpirit: 'watch', otherSpirit: 'watch', currentMediums: 'act', otherMediums: 'watch' },
		{ state: 'mediumsAsk', currentSpirit: 'watch', otherSpirit: 'watch', currentMediums: 'act', otherMediums: 'watch' },
		{
			state: 'spiritAnswers',
			currentSpirit: 'act',
			otherSpirit: 'watch',
			currentMediums: 'watch',
			otherMediums: 'watch',
		},
		{
			state: 'mediumsGetClues',
			currentSpirit: 'watch',
			otherSpirit: 'watch',
			currentMediums: 'act',
			otherMediums: 'watch',
		},
		{ state: 'guessing', currentSpirit: 'watch', otherSpirit: 'watch', currentMediums: 'act', otherMediums: 'watch' },
		{ state: 'nextTurn', currentSpirit: 'wait', otherSpirit: 'wait', currentMediums: 'wait', otherMediums: 'wait' },
		{ state: 'win', currentSpirit: 'wait', otherSpirit: 'wait', currentMediums: 'wait', otherMediums: 'wait' },
		{ state: 'lose', currentSpirit: 'wait', otherSpirit: 'wait', currentMediums: 'wait', otherMediums: 'wait' },
	];
	const config = {
		questionsInHand: 7,
		questionsGivenToSpirit: 2,
	} as const;

	const playerData: UserRecord[] = [
		{ id: 0, name: 'one', color: 'ash', icon: 'angry' },
		{ id: 1, name: 'two', color: 'bloodink', icon: 'bug' },
		{ id: 2, name: 'three', color: 'bone', icon: 'cat' },
		{ id: 3, name: 'four', color: 'brass', icon: 'drama' },
		{ id: 4, name: 'five', color: 'ectoplasm', icon: 'fish' },
		{ id: 5, name: 'six', color: 'haunt', icon: 'skull' },
	];

	const questionById = new Map(questions.map(question => [question.id, question]));

	const gameMachine = setup({
		types: {
			context: {} as GameContext,
			events: {} as GameEvent,
		},
		actions: {
			setupGame: assign(() => createInitialContext()),
			pickWordCard: assign(({ context }) => ({ wordCard: pickOne(words), word: context.word })),
			setWord: assign(({ event }) => {
				if (event.type !== 'pickWord') return {};
				return { currentTeam: 'sun' as Team, word: sanitizeObject(event.word) };
			}),
			drawQuestionHand: assign(({ context }) => drawQuestionHand(context)),
			pickQuestions: assign(({ context, event }) => {
				if (event.type !== 'pickQuestions') return {};
				const picked = event.questionIds.slice(0, config.questionsGivenToSpirit);
				return updateTeam(context, context.currentTeam, team => ({
					...team,
					questions: team.questions.filter(id => !picked.includes(id)),
					spiritQuestionCurrent: null,
					spiritQuestionPicks: picked,
					spiritQuestionDiscards: [],
				}));
			}),
			answerQuestion: assign(({ context, event }) => {
				if (event.type !== 'answer') return {};
				const teamKey = context.currentTeam;
				const team = context.teams[teamKey];
				const questionId = team.spiritQuestionPicks.includes(event.questionId)
					? event.questionId
					: team.spiritQuestionPicks[0];
				if (!questionId) return {};

				const clue = sanitizeClue(event.clue);
				const nextEntry: BoardEntry = {
					id: `${teamKey}-${team.board.length}`,
					type: 'hint',
					value: '',
					fullValue: clue,
					revealed: 0,
					questionId,
				};

				return {
					...updateTeam(context, teamKey, current => ({
						...current,
						spiritQuestionCurrent: questionId,
						spiritQuestionDiscards: current.spiritQuestionPicks.filter(id => id !== questionId),
						spiritQuestionPicks: [],
						board: [...current.board, nextEntry],
					})),
					discardedQuestionsDeck: uniq([...context.discardedQuestionsDeck, ...team.spiritQuestionPicks]),
				};
			}),
			giveEyeHint: assign(({ context, event }) => {
				if (event.type !== 'pickHint') return {};
				const row = context.teams[context.currentTeam].board.length;
				const revealed = revealClue(context, event.clueId);
				return updateTeam(revealed, context.currentTeam, team => ({
					...team,
					eyeUsedRows: uniq([...team.eyeUsedRows, row]),
				}));
			}),
			giveNextLetterClue: assign(({ context }) => {
				const clue = getCurrentClue(context);
				return clue ? revealClue(context, clue.id) : {};
			}),
			startGuess: assign(({ context }) => {
				const teamKey = context.currentTeam;
				const team = context.teams[teamKey];
				if (team.board.length >= board.turns) return {};
				const entry: BoardEntry = {
					id: `${teamKey}-${team.board.length}`,
					type: 'guess',
					value: '',
				};
				return updateTeam(context, teamKey, current => ({ ...current, board: [...current.board, entry] }));
			}),
			recordCorrectGuessLetter: assign(({ context, event }) => {
				if (event.type !== 'guessLetter') return {};
				return updateLastGuess(context, event.letter);
			}),
			recordIncorrectGuessLetter: assign(({ context, event }) => {
				if (event.type !== 'guessLetter') return {};
				return updateLastGuess(context, event.letter, true);
			}),
			setupNextTurn: assign(({ context }) => ({
				currentTeam: context.debugHold ? context.currentTeam : otherTeam(context.currentTeam),
			})),
			debugSetStateContext: assign(({ context, event }) => {
				if (event.type !== 'debugSetState') return {};
				return createDebugContext(event.state, event.team || context.currentTeam);
			}),
			debugSetTeam: assign(({ event }) => {
				if (event.type !== 'debugSetTeam') return {};
				return createDebugContext(event.state, event.team);
			}),
		},
		guards: {
			hasEyeHint: ({ context }) => hasEyeHint(context),
			guessIncorrect: ({ context, event }) => event.type === 'guessLetter' && !nextGuess(context, event.letter).valid,
			guessFullyCorrect: ({ context, event }) =>
				event.type === 'guessLetter' && nextGuess(context, event.letter).value === context.word,
			hasClues: ({ context }) => {
				const clue = getCurrentClue(context);
				return Boolean(clue && clue.done !== true);
			},
			outOfClues: ({ context }) => {
				const clue = getCurrentClue(context);
				return !clue || clue.done === true;
			},
			gameNotOver: ({ context }) =>
				context.teams.sun.board.length < board.turns || context.teams.moon.board.length < board.turns,
			shouldContinueAfterNextTurn: ({ context }) =>
				!context.debugHold &&
				(context.teams.sun.board.length < board.turns || context.teams.moon.board.length < board.turns),
			shouldLoseAfterNextTurn: ({ context }) => !context.debugHold,
			debugStateStart: ({ event }) => event.type === 'debugSetState' && event.state === 'start',
			debugStateSetupWord: ({ event }) => event.type === 'debugSetState' && event.state === 'setupWord',
			debugStateMediumsTurn: ({ event }) => event.type === 'debugSetState' && event.state === 'mediumsTurn',
			debugStateEyeHint: ({ event }) => event.type === 'debugSetState' && event.state === 'eyeHint',
			debugStateMediumsAsk: ({ event }) => event.type === 'debugSetState' && event.state === 'mediumsAsk',
			debugStateSpiritAnswers: ({ event }) => event.type === 'debugSetState' && event.state === 'spiritAnswers',
			debugStateMediumsGetClues: ({ event }) => event.type === 'debugSetState' && event.state === 'mediumsGetClues',
			debugStateGuessing: ({ event }) => event.type === 'debugSetState' && event.state === 'guessing',
			debugStateNextTurn: ({ event }) => event.type === 'debugSetState' && event.state === 'nextTurn',
			debugStateWin: ({ event }) => event.type === 'debugSetState' && event.state === 'win',
			debugStateLose: ({ event }) => event.type === 'debugSetState' && event.state === 'lose',
		},
	}).createMachine({
		id: 'phantomInk',
		context: createInitialContext(),
		initial: 'start',
		on: {
			start: { target: '.setupWord', actions: 'setupGame' },
			debugSetTeam: { actions: 'debugSetTeam' },
			debugSetState: [
				{ guard: 'debugStateStart', target: '.start', actions: 'debugSetStateContext' },
				{ guard: 'debugStateSetupWord', target: '.setupWord', actions: 'debugSetStateContext' },
				{ guard: 'debugStateMediumsTurn', target: '.mediumsTurn', actions: 'debugSetStateContext' },
				{ guard: 'debugStateEyeHint', target: '.eyeHint', actions: 'debugSetStateContext' },
				{ guard: 'debugStateMediumsAsk', target: '.mediumsAsk', actions: 'debugSetStateContext' },
				{ guard: 'debugStateSpiritAnswers', target: '.spiritAnswers', actions: 'debugSetStateContext' },
				{ guard: 'debugStateMediumsGetClues', target: '.mediumsGetClues', actions: 'debugSetStateContext' },
				{ guard: 'debugStateGuessing', target: '.guessing', actions: 'debugSetStateContext' },
				{ guard: 'debugStateNextTurn', target: '.nextTurn', actions: 'debugSetStateContext' },
				{ guard: 'debugStateWin', target: '.win', actions: 'debugSetStateContext' },
				{ guard: 'debugStateLose', target: '.lose', actions: 'debugSetStateContext' },
			],
		},
		states: {
			start: {},
			setupWord: {
				entry: 'pickWordCard',
				on: {
					pickWord: { target: 'mediumsTurn', actions: 'setWord' },
				},
			},
			mediumsTurn: {
				entry: 'drawQuestionHand',
				on: {
					eyeHint: { guard: 'hasEyeHint', target: 'eyeHint' },
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
						{ guard: 'guessFullyCorrect', target: 'win', actions: 'recordCorrectGuessLetter' },
						{ guard: 'guessIncorrect', target: 'nextTurn', actions: 'recordIncorrectGuessLetter' },
						{ actions: 'recordCorrectGuessLetter' },
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
				always: { guard: 'outOfClues', target: 'nextTurn' },
				on: {
					getClue: { guard: 'hasClues', actions: 'giveNextLetterClue' },
					silencio: 'nextTurn',
				},
			},
			nextTurn: {
				entry: 'setupNextTurn',
				always: [
					{ guard: 'shouldContinueAfterNextTurn', target: 'mediumsTurn' },
					{ guard: 'shouldLoseAfterNextTurn', target: 'lose' },
				],
			},
			win: {},
			lose: {},
		},
	});

	const actor = createActor(gameMachine);
	let snapshot = $state(actor.getSnapshot());
	const subscription = actor.subscribe(next => {
		snapshot = next;
	});
	actor.start();

	onDestroy(() => {
		subscription.unsubscribe();
		actor.stop();
	});

	let pickedQuestionIds = $state<Array<QuestionCard['id']>>([]);
	let answerQuestionId = $state<QuestionCard['id']>('');
	let clueText = $state('');
	let guessLetter = $state('');
	let activeActor = $state<ActorKey>('sunMediums');
	let drawerOpen = $state(false);
	let notes = $state<NoteRow[]>([
		{ id: 'word', topic: 'word ideas', note: '' },
		{ id: 'questions', topic: 'questions', note: '' },
		{ id: 'team', topic: 'team read', note: '' },
	]);

	let game = $derived(snapshot.context);
	let currentState = $derived(stateValue(snapshot.value));
	let currentTeam = $derived(game.currentTeam);
	let currentTeamState = $derived(game.teams[currentTeam]);
	let activeActorTeam = $derived(actorTeam(activeActor));
	let otherActorTeam = $derived(otherTeam(activeActorTeam));
	let activeActorTeamState = $derived(game.teams[activeActorTeam]);
	let currentQuestions = $derived(currentTeamState.questions.map(question).filter(isQuestion));
	let spiritQuestions = $derived(currentTeamState.spiritQuestionPicks.map(question).filter(isQuestion));
	let actorQuestions = $derived(activeActorTeamState.questions.map(question).filter(isQuestion));
	let ownSpiritDiscards = $derived(activeActorTeamState.spiritQuestionDiscards.map(question).filter(isQuestion));
	let otherSpiritDiscards = $derived(
		game.teams[otherActorTeam].spiritQuestionDiscards.map(question).filter(isQuestion),
	);
	let revealableClues = $derived(getRevealableClues(game));
	let currentClue = $derived(getCurrentClue(game));
	let currentGuess = $derived(getCurrentGuess(game));
	let canUseEye = $derived(hasEyeHint(game));
	let canTakeTurn = $derived(currentTeamState.board.length < board.turns);
	let activeView = $derived(actorView(currentState, activeActor, currentTeam));
	let activeActorLabel = $derived(actorLabel(activeActor));

	function createInitialContext(): GameContext {
		return {
			currentTeam: 'sun',
			wordCard: pickOne(words),
			word: '',
			debugHold: false,
			discardedQuestionsDeck: [],
			teams: {
				sun: createTeamState([0, 1, 2]),
				moon: createTeamState([3, 4, 5]),
			},
			votes: [],
		};
	}

	function createTeamState(players: Array<UserRecord['id']>): TeamState {
		return {
			spirit: pickOne(players),
			players,
			questions: [],
			spiritQuestionCurrent: null,
			spiritQuestionPicks: [],
			spiritQuestionDiscards: [],
			eyeUsedRows: [],
			board: [],
		};
	}

	function createDebugContext(state: GameState, team: Team): GameContext {
		let context = {
			...createInitialContext(),
			currentTeam: team,
			debugHold: state === 'nextTurn',
		};

		if (state !== 'start' && state !== 'setupWord') {
			context = { ...context, word: firstWord(context.wordCard) };
		}

		if (state === 'mediumsTurn' || state === 'mediumsAsk') {
			context = drawQuestionHand(context);
		}

		if (state === 'eyeHint') {
			context = seedBoardLength(seedHint(context, otherTeam(team), 'ASH'), team, board[team].hints[0] ?? 0);
		}

		if (state === 'spiritAnswers') {
			context = seedSpiritQuestions(context, team);
		}

		if (state === 'mediumsGetClues') {
			context = seedHint(context, team, 'DOG');
		}

		if (state === 'win') {
			context = seedWin(context, team);
		}

		if (state === 'lose') {
			context = seedLose(context);
		}

		return context;
	}

	function drawQuestionHand(context: GameContext): GameContext {
		const team = context.teams[context.currentTeam];
		const needed = config.questionsInHand - team.questions.length;
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

		const drawn = shuffle(available)
			.slice(0, needed)
			.map(question => question.id);

		return {
			...updateTeam(context, context.currentTeam, current => ({
				...current,
				questions: [...current.questions, ...drawn],
			})),
			discardedQuestionsDeck,
		};
	}

	function updateTeam(context: GameContext, team: Team, update: (team: TeamState) => TeamState): GameContext {
		return {
			...context,
			teams: {
				...context.teams,
				[team]: update(context.teams[team]),
			},
		};
	}

	function seedBoardLength(context: GameContext, team: Team, length: number): GameContext {
		return updateTeam(context, team, current => ({
			...current,
			board: range(length).map(index => ({
				id: `${team}-${index}`,
				type: 'guess',
				value: 'X',
				invalid: true,
			})),
		}));
	}

	function seedHint(context: GameContext, team: Team, clue: string): GameContext {
		return updateTeam(context, team, current => ({
			...current,
			board: [
				...current.board,
				{
					id: `${team}-${current.board.length}`,
					type: 'hint',
					value: '',
					fullValue: clue,
					revealed: 0,
					questionId: questionIdAt(0),
				},
			],
		}));
	}

	function seedSpiritQuestions(context: GameContext, team: Team): GameContext {
		return updateTeam(drawQuestionHand(context), team, current => ({
			...current,
			spiritQuestionPicks: [questionIdAt(0), questionIdAt(1)],
		}));
	}

	function seedWin(context: GameContext, team: Team): GameContext {
		return updateTeam(context, team, current => ({
			...current,
			board: [
				{
					id: `${team}-0`,
					type: 'guess',
					value: context.word,
					done: true,
				},
			],
		}));
	}

	function seedLose(context: GameContext): GameContext {
		return teams.reduce((next, team) => seedBoardLength(next, team, board.turns), context);
	}

	function revealClue(context: GameContext, clueId: string): GameContext {
		for (const teamKey of teams) {
			const index = context.teams[teamKey].board.findIndex(entry => entry.id === clueId);
			if (index === -1) continue;

			return updateTeam(context, teamKey, team => {
				const entry = team.board[index];
				if (!entry || entry.type !== 'hint') return team;

				const fullValue = entry.fullValue ?? '';
				const currentRevealed = entry.revealed ?? 0;
				const revealed = Math.min(currentRevealed + 1, fullValue.length);
				const value = currentRevealed >= fullValue.length ? `${fullValue}.` : fullValue.slice(0, revealed);
				const nextEntry = {
					...entry,
					revealed,
					value,
					done: value.endsWith('.'),
				};

				return {
					...team,
					board: team.board.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry)),
				};
			});
		}

		return context;
	}

	function updateLastGuess(context: GameContext, letter: string, invalid = false): GameContext {
		const teamKey = context.currentTeam;
		const team = context.teams[teamKey];
		const index = team.board.length - 1;
		const entry = team.board[index];
		const nextLetter = sanitizeGuessLetter(letter);
		if (!entry || entry.type !== 'guess' || !nextLetter) return context;

		const nextEntry = {
			...entry,
			value: `${entry.value}${nextLetter}`,
			done: !invalid && `${entry.value}${nextLetter}` === context.word,
			invalid,
		};

		return updateTeam(context, teamKey, current => ({
			...current,
			board: current.board.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry)),
		}));
	}

	function nextGuess(context: GameContext, letter: string): { value: string; valid: boolean } {
		const entry = getCurrentGuess(context);
		const value = `${entry?.value ?? ''}${sanitizeGuessLetter(letter)}`;
		return { value, valid: Boolean(value) && context.word.startsWith(value) };
	}

	function getCurrentClue(context: GameContext): BoardEntry | null {
		const entry = context.teams[context.currentTeam].board.at(-1);
		return entry?.type === 'hint' ? entry : null;
	}

	function getCurrentGuess(context: GameContext): BoardEntry | null {
		const entry = context.teams[context.currentTeam].board.at(-1);
		return entry?.type === 'guess' ? entry : null;
	}

	function getRevealableClues(context: GameContext): Array<BoardEntry & { team: Team }> {
		return teams.flatMap(team =>
			context.teams[team].board
				.filter(entry => entry.type === 'hint' && (entry.revealed ?? 0) < (entry.fullValue?.length ?? 0))
				.map(entry => ({ ...entry, team })),
		);
	}

	function hasEyeHint(context: GameContext): boolean {
		const team = context.currentTeam;
		const row = context.teams[team].board.length;
		return (
			board[team].hints.includes(row) &&
			!context.teams[team].eyeUsedRows.includes(row) &&
			getRevealableClues(context).length > 0
		);
	}

	function question(id: QuestionCard['id']): QuestionCard | undefined {
		return questionById.get(id);
	}

	function isQuestion(value: QuestionCard | undefined): value is QuestionCard {
		return Boolean(value);
	}

	function player(id: UserRecord['id']): UserRecord {
		return playerData.find(player => player.id === id) ?? playerData[0];
	}

	function questionIdAt(index: number): QuestionCard['id'] {
		const id = questions[index]?.id;
		if (!id) throw new Error('Missing question card');
		return id;
	}

	function pickOne<T>(items: readonly T[]): T {
		const item = sample(items);
		if (item === undefined) throw new Error('Cannot pick from an empty list');
		return item;
	}

	function firstWord(card: WordCard): string {
		const word = card.words[0];
		if (!word) throw new Error('Missing word card word');
		return sanitizeObject(word);
	}

	function otherTeam(team: Team): Team {
		return team === 'sun' ? 'moon' : 'sun';
	}

	function stateValue(value: unknown): GameState {
		return gameStates.includes(value as GameState) ? (value as GameState) : 'start';
	}

	function actorTeam(actor: ActorKey): Team {
		return actor.startsWith('sun') ? 'sun' : 'moon';
	}

	function actorRelativeRole(actor: ActorKey, team: Team): RelativeActor {
		const isSpirit = actor.endsWith('Spirit');
		const isCurrent = actorTeam(actor) === team;
		if (isSpirit) return isCurrent ? 'currentSpirit' : 'otherSpirit';
		return isCurrent ? 'currentMediums' : 'otherMediums';
	}

	function actorView(state: GameState, actor: ActorKey, team: Team): ViewMode {
		return roleRows.find(row => row.state === state)?.[actorRelativeRole(actor, team)] ?? 'wait';
	}

	function actorLabel(actor: ActorKey): string {
		return actor === 'sunSpirit'
			? 'sun spirit'
			: actor === 'moonSpirit'
				? 'moon spirit'
				: actor === 'sunMediums'
					? 'sun mediums'
					: 'moon mediums';
	}

	function setDebugState(state: GameState): void {
		actor.send({ type: 'debugSetState', state, team: currentTeam });
	}

	function setDebugTeam(team: Team): void {
		actor.send({ type: 'debugSetTeam', state: currentState, team });
	}

	function updateNote(id: string, field: 'topic' | 'note', value: string): void {
		notes = notes.map(note => (note.id === id ? { ...note, [field]: value } : note));
	}

	function waitMessage(state: GameState): string {
		if (state === 'win') return `${currentTeam} wins`;
		if (state === 'lose') return 'both teams lose';
		return 'wait';
	}

	function sanitizeObject(value: string): string {
		return value
			.toUpperCase()
			.replace(/[^A-Z ]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function sanitizeClue(value: string): string {
		return value
			.toUpperCase()
			.replace(/[^A-Z ]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function sanitizeGuessLetter(value: string): string {
		return value
			.toUpperCase()
			.replace(/[^A-Z ]/g, '')
			.trim()
			.slice(0, 1);
	}

	function toggleQuestion(id: QuestionCard['id']): void {
		if (pickedQuestionIds.includes(id)) {
			pickedQuestionIds = pickedQuestionIds.filter(questionId => questionId !== id);
			return;
		}

		pickedQuestionIds =
			pickedQuestionIds.length >= config.questionsGivenToSpirit
				? [pickedQuestionIds[1], id]
				: [...pickedQuestionIds, id];
	}

	function submitQuestions(): void {
		if (pickedQuestionIds.length !== config.questionsGivenToSpirit) return;
		actor.send({ type: 'pickQuestions', questionIds: [pickedQuestionIds[0], pickedQuestionIds[1]] });
		pickedQuestionIds = [];
	}

	function submitAnswer(): void {
		const questionId = answerQuestionId || currentTeamState.spiritQuestionPicks[0];
		if (!questionId || !clueText.trim()) return;
		actor.send({ type: 'answer', questionId, clue: clueText });
		answerQuestionId = '';
		clueText = '';
	}

	function submitGuessLetter(): void {
		if (!guessLetter.trim()) return;
		actor.send({ type: 'guessLetter', letter: guessLetter });
		guessLetter = '';
	}
</script>

<svelte:head>
	<title>Debug Game</title>
</svelte:head>

<div class="debug-game">
	<header class="top-bar">
		<div class="debug-controls">
			<select
				aria-label="Machine state"
				value={currentState}
				onchange={event => setDebugState((event.currentTarget as HTMLSelectElement).value as GameState)}
			>
				{#each gameStates as state}
					<option value={state}>{state}</option>
				{/each}
			</select>

			<div class="team-toggle" aria-label="Active team">
				{#each teams as team}
					<button class:active-toggle={team === currentTeam} onclick={() => setDebugTeam(team)} type="button">
						{team}
					</button>
				{/each}
			</div>
		</div>
		<button onclick={() => actor.send({ type: 'start' })}>{snapshot.matches('start') ? 'Start' : 'Reset'}</button>
	</header>

	<nav class="actor-tabs" aria-label="Actor views">
		{#each actors as actorKey}
			<button class:active-tab={actorKey === activeActor} onclick={() => (activeActor = actorKey)} type="button">
				{actorLabel(actorKey)} ({actorView(currentState, actorKey, currentTeam)})
			</button>
		{/each}
	</nav>

	<section class="actor-view">
		{#if activeView === 'act'}
			{#if snapshot.matches('setupWord')}
				<p class="muted-line">{game.wordCard.words.join(' / ')}</p>
			{:else if snapshot.matches('mediumsTurn')}
				<div class="empty-view"></div>
			{:else if snapshot.matches('eyeHint')}
				<div class="list">
					{#each revealableClues as clue}
						<span class="choice-preview">
							{clue.team}: {clue.value || 'blank'} ({clue.revealed ?? 0}/{clue.fullValue?.length ?? 0})
						</span>
					{/each}
				</div>
			{:else if snapshot.matches('mediumsAsk')}
				<div class="question-grid">
					{#each currentQuestions as q}
						<label class:chosen={pickedQuestionIds.includes(q.id)}>
							<input type="checkbox" checked={pickedQuestionIds.includes(q.id)} onchange={() => toggleQuestion(q.id)} />
							<span>{q.title}</span>
							<small>{q.question}</small>
						</label>
					{/each}
				</div>
			{:else if snapshot.matches('spiritAnswers')}
				<select bind:value={answerQuestionId}>
					<option value=""></option>
					{#each spiritQuestions as q}
						<option value={q.id}>{q.title}: {q.question}</option>
					{/each}
				</select>
				<input bind:value={clueText} placeholder="clue" />
			{:else if snapshot.matches('mediumsGetClues')}
				<p class="mono">
					{currentClue?.value || 'blank'} ({currentClue?.revealed ?? 0}/{currentClue?.fullValue?.length ?? 0})
				</p>
			{:else if snapshot.matches('guessing')}
				<p class="mono">{currentGuess?.value || 'blank'}</p>
				<input
					bind:value={guessLetter}
					maxlength="1"
					placeholder="letter"
					onkeydown={event => event.key === 'Enter' && submitGuessLetter()}
				/>
			{:else}
				<p>{waitMessage(currentState)}</p>
			{/if}
		{:else if activeView === 'watch'}
			<p class="placeholder-snippet">watch</p>
		{:else}
			<p>{waitMessage(currentState)}</p>
		{/if}
	</section>

	<section class="role-table">
		<table>
			<thead>
				<tr>
					<th>state</th>
					<th>current spirit</th>
					<th>other spirit</th>
					<th>current mediums</th>
					<th>other mediums</th>
				</tr>
			</thead>
			<tbody>
				{#each roleRows as row}
					<tr class:active-row={row.state === currentState}>
						<td>{row.state}</td>
						<td>{row.currentSpirit}</td>
						<td>{row.otherSpirit}</td>
						<td>{row.currentMediums}</td>
						<td>{row.otherMediums}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	{#if drawerOpen}
		<aside class="info-drawer" aria-label="Table drawer">
			<header class="drawer-header">
				<button aria-label="Close table drawer" onclick={() => (drawerOpen = false)} type="button">
					<X size={16} />
				</button>
			</header>

			<div class="drawer-sections">
				<details class="drawer-section" open>
					<summary>board</summary>
					<section class="board drawer-board">
						<div class="table-row labels">
							{#each teams as team}
								<div class:active-team={team === currentTeam}>{team}</div>
							{/each}
						</div>

						<div class="table-row players">
							{#each teams as team}
								<div>
									{#each game.teams[team].players as id}
										<span class="player" class:spirit={game.teams[team].spirit === id}>
											<Avatar user={player(id)} />
										</span>
									{/each}
								</div>
							{/each}
						</div>

						{#each turns as turn}
							<div class="table-row words">
								{#each teams as team}
									{@const entry = game.teams[team].board[turn]}
									<div class="cell" class:moon-cell={team === 'moon'}>
										<span class="eye-slot">
											{#if board[team].hints.includes(turn)}
												<Eye size={16} />
											{/if}
										</span>
										<span class:invalid={entry?.invalid} class:done={entry?.done}>
											{entry?.value || '\u00a0'}
										</span>
									</div>
								{/each}
							</div>
						{/each}
					</section>
				</details>

				<details class="drawer-section" open>
					<summary>questions</summary>
					<div class="question-list">
						{#if actorQuestions.length}
							{#each actorQuestions as q}
								<div class="question-row">
									<strong>{q.title}</strong>
									<span>{q.question}</span>
								</div>
							{/each}
						{/if}
					</div>
				</details>

				<details class="drawer-section">
					<summary>your spirit discards</summary>
					<div class="question-list">
						{#if ownSpiritDiscards.length}
							{#each ownSpiritDiscards as q}
								<div class="question-row">
									<strong>{q.title}</strong>
									<span>{q.question}</span>
								</div>
							{/each}
						{/if}
					</div>
				</details>

				<details class="drawer-section">
					<summary>other spirit discards</summary>
					<div class="question-list">
						{#if otherSpiritDiscards.length}
							{#each otherSpiritDiscards as q}
								<div class="question-row">
									<strong>{q.title}</strong>
									<span>{q.question}</span>
								</div>
							{/each}
						{/if}
					</div>
				</details>

				<details class="drawer-section" open>
					<summary>notes</summary>
					<table class="notes-table">
						<tbody>
							{#each notes as note}
								<tr>
									<td>
										<input
											placeholder="topic"
											value={note.topic}
											oninput={event => updateNote(note.id, 'topic', event.currentTarget.value)}
										/>
									</td>
									<td>
										<textarea
											value={note.note}
											placeholder="note"
											oninput={event => updateNote(note.id, 'note', event.currentTarget.value)}
										></textarea>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</details>
			</div>
		</aside>
	{/if}

	<div class="action-dock">
		<button
			class="drawer-trigger"
			aria-expanded={drawerOpen}
			aria-label="Open table drawer"
			onclick={() => (drawerOpen = !drawerOpen)}
			type="button"
		>
			Table
		</button>
		<div class="action-bar">
			<div class="action-buttons">
				{#if snapshot.matches('start')}
					<button onclick={() => actor.send({ type: 'start' })}>Start</button>
				{:else if activeView === 'act'}
					{#if snapshot.matches('setupWord')}
						{#each game.wordCard.words as word}
							<button onclick={() => actor.send({ type: 'pickWord', word })}>{word}</button>
						{/each}
					{:else if snapshot.matches('mediumsTurn')}
						<button disabled={!canUseEye} onclick={() => actor.send({ type: 'eyeHint' })}>Use Eye</button>
						<button disabled={!canTakeTurn} onclick={() => actor.send({ type: 'ask' })}>Ask</button>
						<button disabled={!canTakeTurn} onclick={() => actor.send({ type: 'guess' })}>Guess</button>
					{:else if snapshot.matches('eyeHint')}
						{#each revealableClues as clue}
							<button onclick={() => actor.send({ type: 'pickHint', clueId: clue.id })}>
								{clue.team}: {clue.value || 'blank'}
							</button>
						{/each}
					{:else if snapshot.matches('mediumsAsk')}
						<button disabled={pickedQuestionIds.length !== config.questionsGivenToSpirit} onclick={submitQuestions}>
							Give to Spirit
						</button>
					{:else if snapshot.matches('spiritAnswers')}
						<button disabled={!clueText.trim()} onclick={submitAnswer}>Submit Clue</button>
					{:else if snapshot.matches('mediumsGetClues')}
						<button onclick={() => actor.send({ type: 'getClue' })}>Get Letter</button>
						<button onclick={() => actor.send({ type: 'silencio' })}>Silencio</button>
					{:else if snapshot.matches('guessing')}
						<button disabled={!guessLetter.trim()} onclick={submitGuessLetter}>Submit Letter</button>
					{:else}
						<span class="empty-actions">no actions</span>
					{/if}
				{:else}
					<span class="empty-actions">no actions</span>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.debug-game {
		position: relative;
		display: grid;
		gap: 1rem;
		padding: 1rem;
		color: var(--app-text);
	}

	button,
	input,
	select,
	textarea {
		border: 1px solid var(--app-border);
		border-radius: 2px;
		padding: 0.45rem 0.6rem;
		background: var(--app-input);
		color: inherit;
	}

	button:disabled {
		opacity: 0.45;
	}

	.top-bar,
	.debug-controls {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.top-bar {
		justify-content: space-between;
	}

	p {
		margin: 0;
	}

	small {
		color: var(--app-muted);
		font-size: 0.8rem;
	}

	.muted-line,
	.empty-actions {
		color: var(--app-muted);
	}

	.choice-preview {
		display: inline-flex;
		padding: 0.25rem 0;
	}

	.team-toggle,
	.actor-tabs {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.team-toggle button,
	.actor-tabs button {
		background: transparent;
	}

	.active-toggle,
	.active-tab {
		background: color-mix(in srgb, var(--app-accent) 16%, transparent) !important;
	}

	.board,
	.actor-view,
	.role-table {
		border: 0;
		border-radius: 0;
		background: transparent;
	}

	.actor-view {
		display: grid;
		gap: 0.75rem;
		min-height: 3.5rem;
		padding: 0.25rem 0;
	}

	.table-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-bottom: 1px solid var(--app-border);
	}

	.table-row:last-child {
		border-bottom: 0;
	}

	.table-row > * {
		padding: 0.5rem;
	}

	.labels {
		text-transform: uppercase;
		font-weight: 700;
	}

	.active-team {
		background: color-mix(in srgb, var(--app-accent) 16%, transparent);
	}

	.players > div {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.player {
		display: inline-flex;
		gap: 0.25rem;
		align-items: center;
	}

	.spirit {
		text-decoration: underline;
	}

	.cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		text-transform: uppercase;
		min-height: 2rem;
	}

	.moon-cell {
		flex-direction: row-reverse;
		text-align: right;
	}

	.eye-slot {
		width: 1rem;
		display: inline-flex;
	}

	.invalid {
		color: var(--app-error);
		text-decoration: line-through;
	}

	.done {
		font-weight: 700;
	}

	.list {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.question-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.5rem;
	}

	.question-grid label {
		display: grid;
		gap: 0.2rem;
		border-bottom: 1px solid var(--app-border);
		padding: 0.5rem 0;
	}

	.question-grid input {
		width: max-content;
	}

	.chosen {
		background: color-mix(in srgb, var(--app-accent) 12%, transparent);
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		text-transform: uppercase;
	}

	.placeholder-snippet {
		margin: 0;
		color: var(--app-muted);
		white-space: pre-wrap;
	}

	.role-table {
		border-top: 1px solid var(--app-border);
		overflow-x: auto;
	}

	.info-drawer {
		position: sticky;
		bottom: 5.75rem;
		z-index: 35;
		display: grid;
		gap: 0.5rem;
		width: auto;
		margin: 0 -1rem;
		max-height: min(64dvh, 36rem);
		border: 1px solid var(--app-border);
		border-width: 1px 0;
		border-radius: 0;
		background: var(--app-panel);
		box-shadow: 0 -0.25rem 0.8rem color-mix(in srgb, black 16%, transparent);
		padding: 0.65rem 1rem;
		overflow: auto;
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.drawer-sections {
		display: grid;
	}

	.drawer-section {
		border-top: 1px solid var(--app-border);
		border-radius: 0;
		background: transparent;
		overflow: hidden;
	}

	.drawer-section:last-child {
		border-bottom: 1px solid var(--app-border);
	}

	.drawer-section summary {
		cursor: pointer;
		padding: 0.55rem 0;
		font-weight: 600;
	}

	.drawer-section[open] summary {
		border-bottom: 0;
	}

	.drawer-board {
		border: 0;
		border-radius: 0;
		background: transparent;
	}

	.question-list {
		display: grid;
		padding-bottom: 0.4rem;
	}

	.question-row {
		display: grid;
		gap: 0.15rem;
		border-top: 1px solid color-mix(in srgb, var(--app-border) 64%, transparent);
		padding: 0.45rem 0;
		background: transparent;
	}

	.notes-table input,
	.notes-table textarea {
		width: 100%;
		min-width: 12rem;
	}

	.notes-table textarea {
		min-height: 3rem;
		resize: vertical;
	}

	.action-dock {
		position: sticky;
		bottom: 0;
		z-index: 40;
		display: grid;
		justify-items: center;
		margin: 1rem -1rem -1rem;
		padding-top: 1.65rem;
		background: var(--app-panel);
		box-shadow: 0 -0.22rem 0.7rem color-mix(in srgb, black 14%, transparent);
		pointer-events: none;
	}

	.drawer-trigger,
	.action-bar {
		pointer-events: auto;
	}

	.drawer-trigger {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -42%);
		border-radius: 999px;
		background: var(--app-accent);
		color: var(--app-accent-ink);
		font-weight: 700;
		box-shadow: 0 -0.12rem 0.45rem color-mix(in srgb, black 18%, transparent);
	}

	.action-bar {
		display: grid;
		align-items: center;
		width: 100%;
		border-top: 1px solid var(--app-border);
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		padding: 0.55rem 1rem 0.65rem;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: flex-end;
		overflow-x: auto;
	}

	.action-buttons button {
		white-space: nowrap;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}

	th,
	td {
		padding: 0.5rem;
		border-bottom: 1px solid var(--app-border);
		text-align: left;
		white-space: nowrap;
	}

	th {
		color: var(--app-muted);
		font-weight: 600;
	}

	tr:last-child td {
		border-bottom: 0;
	}

	.active-row td {
		background: color-mix(in srgb, var(--app-accent) 12%, transparent);
	}

	@media (max-width: 640px) {
		.action-buttons {
			justify-content: flex-start;
		}
	}
</style>
