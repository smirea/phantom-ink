<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import { playerColorPreset } from '$lib/playerPresentation';
	import { Check, Eye, Info, Maximize2, Minimize2, X } from '@lucide/svelte';
	import { board, questions, words, type QuestionCard, type WordCard } from '@repo/shared/data';
	import type { User } from '@repo/shared/onlineGame';
	import type { Team } from '@repo/shared/types';
	import { range, sample, shuffle, uniq } from 'es-toolkit';
	import { produce } from 'immer';
	import { onDestroy } from 'svelte';
	import { crossfade, fade, fly, slide } from 'svelte/transition';
	import { assign, createActor, enqueueActions, setup } from 'xstate';

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
	type BoardEntry = {
		type: 'guess' | 'clue';
		value: string;
		fullValue?: string;
		hint?: string;
		questionId?: QuestionCard['id'];
		discardedQuestionId?: QuestionCard['id'];
	};
	type KnownQuestion = { kind: 'used' | 'discarded'; question: QuestionCard };
	type VoteState = { voted: User['id'][]; eligible: User[]; required: number };
	type VoteOption = number | string;

	interface TeamState {
		spirit: User['id'];
		players: Array<User['id']>;
		questions: Array<QuestionCard['id']>;
		spiritQuestionPicks: Array<QuestionCard['id']>;
		board: BoardEntry[];
	}

	interface GameContext {
		currentTeam: Team;
		wordCardId: WordCard['id'];
		word: string;
		discardedQuestionsDeck: Array<QuestionCard['id']>;
		teams: Record<Team, TeamState>;
		voting: Partial<Record<VoteType, Partial<Record<User['id'], VoteOption[]>>>>;
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
		| { type: 'vote'; action: VoteType; option: VoteOption; userId: User['id'] }
		| { type: 'debugSetState'; state: GameState; team: Team }
		| { type: 'debugSetTeam'; state: GameState; team: Team };

	const teams = ['sun', 'moon'] as const;
	const config = {
		questionsInHand: 7,
		questionsGivenToSpirit: 2,
		keyboardRows: ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), 'ZXCVBNM'.split(''), [' ']],
		runes: 'ᚡᚢᚣᚤᚥᚦᚧᚩᚫᚭᚮᚯᚱᚲᚳᚴᚵᚶᚷᚸᚹᚺᚻᚼᚽᚾᚿᛀᛁᛂᛃᛄᛅᛆᛇᛈᛉᛊᛋᛏᛐᛑᛒᛓᛔᛗᛘᛙᛚᛛᛜᛝᛞᛟᛠᛡᛢᛣᛤᛥᛦᛨᛩᛪ'.split(''),
	} as const;
	const [sendQuestionCard, receiveQuestionCard] = crossfade({
		duration: 220,
		fallback: node => fade(node, { duration: 160 }),
	});

	type VoteType = 'pickWord' | 'mediumAction' | 'pickQuestions' | 'clue' | 'guessLetter' | 'pickHint';
	type VoteConfig = {
		activeState: GameState;
		mode: 'anySpirit' | 'activeMedium';
		count: number;
		choices: (ctx: GameContext) => VoteOption[];
		event: (ctx: GameContext, options: VoteOption[]) => GameEvent | null;
	};

	const votingConfig = {
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
			count: config.questionsGivenToSpirit,
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
			choices: (_ctx: GameContext) => config.keyboardRows.flat(),
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

	const canSeeVote = (state: GameState, voteId: VoteType) => votingConfig[voteId].activeState === state;

	function canVote(state: GameState, ctx: GameContext, voteId: VoteType, id: User['id']): boolean {
		if (!canSeeVote(state, voteId)) return false;

		if (votingConfig[voteId].mode === 'anySpirit') {
			const team = ctx.teams.sun.players.includes(id) ? ctx.teams.sun : ctx.teams.moon;
			return team.spirit === id;
		}

		const team = ctx.teams[ctx.currentTeam];
		return team.players.includes(id) && team.spirit !== id;
	}

	const gameMachine = setup({
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
				const picked = event.questionIds.slice(0, config.questionsGivenToSpirit);
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
				if (event.type !== 'vote') return {};

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

	const game = $derived(snapshot.context);
	const currentState = $derived(snapshot.value as GameState);
	const currentTeamName = $derived(game.currentTeam);
	let questionsMinimized = $state(false);

	function createInitialContext(): GameContext {
		return {
			currentTeam: 'sun',
			wordCardId: sample(words).id,
			word: '',
			discardedQuestionsDeck: [],
			teams: {
				sun: createTeamState([0, 1, 2]),
				moon: createTeamState([3, 4, 5]),
			},
			voting: {},
		};
	}

	function createTeamState(players: Array<User['id']>, board: BoardEntry[] = []): TeamState {
		return {
			spirit: sample(players),
			players,
			questions: [],
			spiritQuestionPicks: [],
			board,
		};
	}

	function wordCard(context: GameContext): WordCard {
		return words.find(card => card.id === context.wordCardId)!;
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

		return produce(context, draft => {
			draft.discardedQuestionsDeck = discardedQuestionsDeck;
			draft.teams[draft.currentTeam].questions.push(...drawn);
		});
	}

	function toggleVote<V extends VoteType>(
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

	function revealClue(context: GameContext, clueId: string, hint?: string): GameContext {
		const clue = parseBoardEntryId(clueId);
		if (!clue) return context;

		return produce(context, draft => {
			const entry = draft.teams[clue.team].board[clue.index];
			if (!entry || entry.type !== 'clue' || !entry.fullValue) return;

			entry.value = entry.fullValue.slice(0, Math.min(entry.value.length + 1, entry.fullValue.length));
			entry.hint = hint ?? entry.hint;
		});
	}

	function updateLastGuess(context: GameContext, letter: string): GameContext {
		const nextLetter = sanitizeGuessLetter(letter);
		if (!nextLetter) return context;

		return produce(context, draft => {
			const entry = draft.teams[draft.currentTeam].board.at(-1);
			if (!entry || entry.type !== 'guess') return;

			const value = `${entry.value}${nextLetter}`;
			entry.value = value;
		});
	}

	function nextGuess(context: GameContext, letter: string): { value: string; valid: boolean } {
		const entry = context.teams[context.currentTeam].board.at(-1);
		const value = `${entry?.type === 'guess' ? entry.value : ''}${sanitizeGuessLetter(letter)}`;
		return { value, valid: Boolean(value) && context.word.startsWith(value) };
	}

	function getCurrentClue(context: GameContext): BoardEntry | null {
		const entry = context.teams[context.currentTeam].board.at(-1);
		return entry?.type === 'clue' ? entry : null;
	}

	function isBoardEntryDone(context: GameContext, entry: BoardEntry | undefined): boolean {
		if (!entry) return false;
		return entry.type === 'guess'
			? entry.value === context.word
			: Boolean(entry.fullValue && entry.value === entry.fullValue);
	}

	function revealableClueIds(context: GameContext): string[] {
		return teams.flatMap(team =>
			context.teams[team].board.flatMap((entry, index) =>
				entry.type === 'clue' && !isBoardEntryDone(context, entry) ? [boardEntryId(team, index)] : [],
			),
		);
	}

	function hasEyeHint(context: GameContext): boolean {
		const team = context.currentTeam;
		const row = context.teams[team].board.length;
		const hint = boardEntryId(team, row);
		return (
			board[team].hints.includes(row) &&
			!teams.some(team => context.teams[team].board.some(entry => entry.hint === hint)) &&
			revealableClueIds(context).length > 0
		);
	}

	function consensusEvent(state: GameState, context: GameContext, action: VoteType): GameEvent | null {
		const options = consensusOptions(state, context, action);
		return options.length === votingConfig[action].count ? votingConfig[action].event(context, options) : null;
	}

	function optionVoteState(s: GameState, context: GameContext, action: VoteType, option: VoteOption): VoteState {
		const selected = context.voting[action] ?? {};
		const eligible = playerData.filter(user => canVote(s, context, action, user.id));
		const voted = eligible.filter(user => selected[user.id]?.includes(option)).map(user => user.id);
		return { voted, eligible, required: eligible.length };
	}

	function consensusOptions(s: GameState, context: GameContext, action: VoteType): VoteOption[] {
		const voteConfig = votingConfig[action];
		const eligible = playerData.filter(user => canVote(s, context, action, user.id));
		if (!eligible.length) return [];

		const selected = context.voting[action] ?? {};
		if (eligible.some(user => (selected[user.id]?.length ?? 0) < voteConfig.count)) return [];

		const counts = new Map<VoteOption, number>();
		for (const user of eligible) {
			for (const option of selected[user.id] ?? []) {
				counts.set(option, (counts.get(option) ?? 0) + 1);
			}
		}

		return votingConfig[action]
			.choices(context)
			.filter(option => counts.get(option) === eligible.length)
			.slice(0, voteConfig.count);
	}

	function voteLabel(option: VoteOption): string {
		if (option === ' ') return 'Space';
		return String(option).replace(/^\w/, match => match.toUpperCase());
	}

	function player(userId: User['id']): User {
		return playerData.find(user => user.id === userId)!;
	}

	function playerColor(userId: User['id']): string {
		return playerColorPreset(player(userId).color).value;
	}

	function canAnswerSpirit(context: GameContext, id: User['id']): boolean {
		return context.teams[context.currentTeam].spirit === id;
	}

	function playerTeam(context: GameContext, id: User['id']): Team {
		return context.teams.sun.players.includes(id) ? 'sun' : 'moon';
	}

	function questionById(id: QuestionCard['id'] | undefined): QuestionCard | undefined {
		return id ? questions.find(question => question.id === id) : undefined;
	}

	function knownQuestionsForCell(
		context: GameContext,
		viewerId: User['id'],
		team: Team,
		turn: number,
	): KnownQuestion[] {
		const entry = context.teams[team].board[turn];
		if (entry?.type !== 'clue') return [];

		const known: KnownQuestion[] = [];
		const answered = questionById(entry.questionId);
		const discarded = questionById(entry.discardedQuestionId);
		if (team === playerTeam(context, viewerId) && answered) {
			known.push({ kind: 'used', question: answered });
		}
		if (discarded) {
			known.push({ kind: 'discarded', question: discarded });
		}
		return known;
	}

	function rowHasKnownQuestions(context: GameContext, viewerId: User['id'], turn: number): boolean {
		return teams.some(team => knownQuestionsForCell(context, viewerId, team, turn).length > 0);
	}

	function selectedAnswerQuestionId(context: GameContext): QuestionCard['id'] | undefined {
		const picks = context.teams[context.currentTeam].spiritQuestionPicks;
		return answerQuestionId && picks.includes(answerQuestionId) ? answerQuestionId : picks[0];
	}

	function toggleBoardRowQuestions(context: GameContext, turn: number) {
		if (!rowHasKnownQuestions(context, debugUser, turn)) {
			expandedBoardRows = expandedBoardRows.filter(row => row !== turn);
			return;
		}
		expandedBoardRows = expandedBoardRows.includes(turn)
			? expandedBoardRows.filter(row => row !== turn)
			: [...expandedBoardRows, turn];
	}

	function hasUserVote(context: GameContext, action: VoteType, id: User['id']): boolean {
		return Boolean(context.voting[action]?.[id]?.length);
	}

	function userVoteCount(context: GameContext, action: VoteType, id: User['id']): number {
		return context.voting[action]?.[id]?.length ?? 0;
	}

	function answerClue(questionId: QuestionCard['id']) {
		const clue = clueDrafts[questionId]?.trim();
		if (!clue) return;

		actor.send({ type: 'answer', questionId, clue });
	}

	function currentClueQuestion(context: GameContext): QuestionCard | null {
		const clue = getCurrentClue(context);
		return clue?.questionId ? questions.find(question => question.id === clue.questionId)! : null;
	}

	function guessParts(context: GameContext, entry: BoardEntry): { valid: string; invalid: string } {
		let validLength = entry.value.length;
		for (let index = 1; index <= entry.value.length; index += 1) {
			if (!context.word.startsWith(entry.value.slice(0, index))) {
				validLength = index - 1;
				break;
			}
		}

		return {
			valid: entry.value.slice(0, validLength),
			invalid: entry.value.slice(validLength),
		};
	}

	function isCurrentGuessCell(context: GameContext, team: Team, turn: number): boolean {
		const teamState = context.teams[team];
		const entry = teamState.board[turn];
		return (
			currentState === 'guessing' &&
			context.currentTeam === team &&
			turn === teamState.board.length - 1 &&
			entry?.type === 'guess'
		);
	}

	function wordRunes(
		hash: string,
		{ words = 1, min = 6, max = 20 }: { words?: number; min?: number; max?: number } = {},
	): string[][] {
		const seed = seededNumber(hash);
		return range(words).map(wordIndex => {
			const wordSeed = seededNumber(`${hash}:${wordIndex}`);
			const length = min + (wordSeed % (max - min + 1));
			return range(length).map(index => config.runes[(seed + wordIndex * 23 + index * 7) % config.runes.length]);
		});
	}

	function runeStyle(hash: string): string {
		const seed = seededNumber(hash);
		const direction = seed % 2 ? 1 : -1;
		return [
			`--rune-delay: -${seed % 2600}ms`,
			`--rune-duration: ${2400 + (seed % 900)}ms`,
			`--rune-drift: ${direction}`,
		].join('; ');
	}

	function seededNumber(value: string): number {
		let hash = 2166136261;
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	}

	function boardEntryId(team: Team, index: number): string {
		return `${team}:${index}`;
	}

	function parseBoardEntryId(id: string): { team: Team; index: number } | null {
		const [team, index] = id.split(':');
		if ((team !== 'sun' && team !== 'moon') || index === undefined) return null;

		const parsed = Number(index);
		return Number.isInteger(parsed) ? { team, index: parsed } : null;
	}

	function sanitizePhrase(value: string): string {
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
			.slice(0, 1);
	}

	const playerData: User[] = [
		{ id: 0, name: 'one', color: 'ash', icon: 'angry' },
		{ id: 1, name: 'two', color: 'bloodink', icon: 'bug' },
		{ id: 2, name: 'three', color: 'bone', icon: 'cat' },
		{ id: 3, name: 'four', color: 'brass', icon: 'drama' },
		{ id: 4, name: 'five', color: 'ectoplasm', icon: 'fish' },
		{ id: 5, name: 'six', color: 'haunt', icon: 'skull' },
	];

	let debugUser = $state<User['id']>(playerData[0].id);
	let clueDrafts = $state<Record<string, string>>({});
	let answerQuestionId = $state<QuestionCard['id'] | null>(null);
	let expandedBoardRows = $state<number[]>([]);

	/*
	actor.send({
		type: 'debugSetState',
		state: 'setupWord',
		team: 'sun',
	});
	actor.send({
		type: 'pickWord',
		word: 'potato',
	});
	actor.send({
		type: 'debugSetState',
		state: 'mediumsTurn',
		team: 'sun',
	});
	actor.send({
		type: 'debugSetState',
		state: 'mediumsAsk',
		team: 'sun',
	});
	actor.send({
		type: 'pickQuestions',
		questionIds: [questions[5].id, questions[1].id],
	});
	actor.send({
		type: 'debugSetState',
		state: 'guessing',
		team: 'sun',
	});
	*/

	const currentTeam = $derived(snapshot.context.teams[snapshot.context.currentTeam]);
	const hasQuestionFooterContent = $derived(
		canVote(currentState, game, 'pickQuestions', debugUser) ||
			currentTeam.questions.some(
				(_qId, questionIndex) => optionVoteState(currentState, game, 'pickQuestions', questionIndex).voted.length > 0,
			),
	);
	const actionFooterKind = $derived(
		canSeeVote(currentState, 'guessLetter')
			? 'keyboard'
			: currentState === 'spiritAnswers'
				? 'answer'
				: canSeeVote(currentState, 'pickQuestions') && questionsMinimized && hasQuestionFooterContent
					? 'questions'
					: canSeeVote(currentState, 'mediumAction') || canSeeVote(currentState, 'clue')
						? 'buttons'
						: undefined,
	);
	const hasActionFooter = $derived(Boolean(actionFooterKind));

	$effect(() => {
		if (currentState !== 'mediumsAsk') questionsMinimized = false;
	});
</script>

{#snippet runes(hash: string, config?: Parameters<typeof wordRunes>[1])}
	<span class="rune-word">
		{#each wordRunes(hash, config) as runeGroup, groupIndex (groupIndex)}
			<span class="rune-group">
				{#each runeGroup as rune, runeIndex (runeIndex)}
					<span class="rune" style={runeStyle(`${hash}:${groupIndex}:${runeIndex}`)}>{rune}</span>
				{/each}
			</span>
		{/each}
	</span>
{/snippet}

{#snippet VoteStack(voteState: VoteState)}
	<span class="vote-stack">
		{#each voteState.voted as userId (userId)}
			<span class="vote-ghost" transition:fly={{ y: 16, duration: 260 }}>
				<Avatar user={player(userId)} name={false} />
			</span>
		{/each}
	</span>
{/snippet}

{#snippet VoteDots(voteState: VoteState)}
	<span class="vote-dots">
		{#each voteState.voted as userId (userId)}
			<span
				aria-hidden="true"
				class="vote-dot"
				style:--vote-color={playerColor(userId)}
				transition:fly={{ y: 8, duration: 220 }}
			></span>
		{/each}
	</span>
{/snippet}

{#snippet QuestionChoice(q: QuestionCard, questionIndex: number, canPickQuestions: boolean, compact: boolean)}
	{@const voteState = optionVoteState(currentState, game, 'pickQuestions', questionIndex)}
	<button
		aria-pressed={voteState.voted.includes(debugUser)}
		class="question-card"
		class:question-card-compact={compact}
		data-voted={voteState.voted.includes(debugUser)}
		disabled={!canPickQuestions}
		in:receiveQuestionCard={{ key: q.id }}
		onclick={() =>
			actor.send({
				type: 'vote',
				action: 'pickQuestions',
				option: questionIndex,
				userId: debugUser,
			})}
		out:sendQuestionCard={{ key: q.id }}
		type="button"
	>
		<span class="question-title">
			<span class="question-title-text">
				{#if canPickQuestions}
					{q.title}
				{:else}
					{@render runes(`${q.id}:title`, { words: 2, min: 3, max: 8 })}
				{/if}
			</span>
			{#if voteState.voted.length}
				<span class="question-title-votes" transition:fade={{ duration: 160 }}>
					{@render VoteStack(voteState)}
				</span>
			{/if}
		</span>
		<span class="question-body">
			{#if canPickQuestions}
				{q.question}
			{:else}
				{@render runes(`${q.id}:question`, { words: 5, min: 3, max: 9 })}
			{/if}
		</span>
	</button>
{/snippet}

{#snippet QuestionVoteTally()}
	{@const tallies = currentTeam.questions
		.map((qId, questionIndex) => ({
			q: questions.find(x => x.id === qId)!,
			voteState: optionVoteState(currentState, game, 'pickQuestions', questionIndex),
		}))
		.filter(tally => tally.voteState.voted.length)}
	{#if tallies.length}
		<div class="question-vote-tally">
			{#each tallies as { q, voteState } (q.id)}
				<div class="question-vote-row">
					<span class="question-vote-label">{q.title}:</span>
					<span class="question-vote-avatars">
						{#each voteState.voted as userId (userId)}
							<span class="question-voter" transition:fly={{ y: 8, duration: 200 }}>
								<Avatar user={player(userId)} name={false} />
							</span>
						{/each}
					</span>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet BoardValue(entry: BoardEntry | undefined)}
	{#if entry?.type === 'guess'}
		{@const parts = guessParts(game, entry)}
		<span class="board-value" class:done={isBoardEntryDone(game, entry)} data-entry-type="guess">
			<span class="guess-valid">{parts.valid || (!parts.invalid ? '\u00a0' : '')}</span>
			{#if parts.invalid}
				<span class="guess-invalid">{parts.invalid}</span>
			{/if}
		</span>
	{:else}
		<span
			class="board-value"
			class:done={isBoardEntryDone(game, entry)}
			data-entry-type={entry?.type}
			data-letter-hint={entry?.type === 'clue' && entry.value ? 'true' : undefined}
			data-eye-hint={entry?.hint ? 'true' : undefined}
		>
			{entry?.value || '\u00a0'}
		</span>
	{/if}
{/snippet}

<div
	class="debug-game"
	data-action-footer={actionFooterKind}
	data-questions-minimized={currentState === 'mediumsAsk' && questionsMinimized ? 'true' : undefined}
	data-state={currentState}
	data-has-actions={hasActionFooter}
>
	<header class="top-bar">
		<div class="debug-controls">
			<select
				aria-label="Machine state"
				value={currentState}
				onchange={event =>
					actor.send({
						type: 'debugSetState',
						state: event.currentTarget.value as GameState,
						team: currentTeamName,
					})}
			>
				{#each gameStates as state}
					<option value={state}>{state}</option>
				{/each}
			</select>

			<div class="team-toggle" aria-label="Active team">
				{#each teams as team}
					<button
						class:active-toggle={team === currentTeamName}
						onclick={() => actor.send({ type: 'debugSetTeam', state: currentState, team })}
						type="button"
					>
						{team}
					</button>
				{/each}
			</div>
		</div>
		<Avatar user={player(debugUser)} />
		<button onclick={() => actor.send({ type: 'start' })}>
			{snapshot.matches('start') ? 'Start' : 'Reset'}
		</button>
	</header>

	<div class="game-content">
		<div class="board">
			<div class="board-row board-header-row">
				{#each teams as team}
					{#if team === 'moon'}
						<div class="board-row-toggle-slot"></div>
					{/if}
					<div class="flex gap-2" class:flex-row-reverse={team === 'moon'}>
						{#each game.teams[team].players as userId}
							<Avatar
								user={player(userId)}
								onclick={() => (debugUser = userId)}
								class={game.teams[team].spirit === userId ? 'underline' : ''}
							/>
						{/each}
					</div>
				{/each}
			</div>
			{#each range(board.turns) as turn}
				{@const hasKnownQuestions = rowHasKnownQuestions(game, debugUser, turn)}
				{@const rowExpanded = expandedBoardRows.includes(turn)}
				<div
					class="board-row-group"
					data-expanded={rowExpanded ? 'true' : undefined}
					data-has-known={hasKnownQuestions ? 'true' : undefined}
				>
					<div class="board-row">
						{#each teams as team}
							{#if team === 'moon'}
								<button
									class="row-question-toggle"
									disabled={!hasKnownQuestions}
									onclick={() => toggleBoardRowQuestions(game, turn)}
									type="button"
								>
									<span class="row-toggle-icon">
										{#if rowExpanded}
											<X size={18} />
										{:else}
											<Info size={18} />
										{/if}
									</span>
								</button>
							{/if}
							{@const entry = game.teams[team].board[turn]}
							{@const clueId = boardEntryId(team, turn)}
							{@const isGuessingCell = isCurrentGuessCell(game, team, turn)}
							{@const canPickHintCell =
								canSeeVote(currentState, 'pickHint') && entry?.type === 'clue' && !isBoardEntryDone(game, entry)}
							{#if canPickHintCell}
								{@const voteState = optionVoteState(currentState, game, 'pickHint', clueId)}
								{@const canUseHintCell = canVote(currentState, game, 'pickHint', debugUser)}
								<button
									aria-pressed={voteState.voted.includes(debugUser)}
									class="board-cell"
									class:flex-row-reverse={team === 'moon'}
									data-hint-target={canUseHintCell && !hasUserVote(game, 'pickHint', debugUser) ? 'true' : undefined}
									data-guess-target={isGuessingCell ? 'true' : undefined}
									data-voted={voteState.voted.includes(debugUser)}
									disabled={!canUseHintCell}
									onclick={() => actor.send({ type: 'vote', action: 'pickHint', option: clueId, userId: debugUser })}
									type="button"
								>
									{#if board[team].hints.includes(turn)}
										<Eye size={24} />
									{:else}
										<div class="board-eye-space"></div>
									{/if}
									{@render BoardValue(entry)}
									{@render VoteStack(voteState)}
								</button>
							{:else}
								<div
									class="board-cell"
									class:flex-row-reverse={team === 'moon'}
									data-guess-target={isGuessingCell ? 'true' : undefined}
								>
									{#if board[team].hints.includes(turn)}
										<Eye size={24} />
									{:else}
										<div class="board-eye-space"></div>
									{/if}
									{@render BoardValue(entry)}
								</div>
							{/if}
						{/each}
					</div>
					{#if rowExpanded && hasKnownQuestions}
						<div class="row-question-popover" transition:slide={{ duration: 180 }}>
							{#each teams as questionTeam}
								<div class="row-question-column" data-team={questionTeam}>
									{#each knownQuestionsForCell(game, debugUser, questionTeam, turn) as known (`${questionTeam}:${known.kind}:${known.question.id}`)}
										<div class="known-question" data-kind={known.kind}>
											<span class="known-question-icon">
												{#if known.kind === 'used'}
													<Check size={14} />
												{:else}
													<X size={14} />
												{/if}
											</span>
											<span class="known-question-copy">
												<strong>{known.question.title}:</strong>
												{known.question.question}
											</span>
										</div>
									{:else}
										<span class="known-question-empty"></span>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if currentState === 'start'}
			<div class="state-panel start-panel">
				<div class="panel-runes">{@render runes('start', { words: 4, min: 3, max: 8 })}</div>
				<InkButton size="lg" primary onclick={() => actor.send({ type: 'start' })}>Start</InkButton>
			</div>
		{/if}

		{#if canSeeVote(currentState, 'pickWord')}
			{@const canPickWord = canVote(currentState, game, 'pickWord', debugUser)}
			<div class="pick-word-stage">
				<div class="pick-word" data-can-vote={canPickWord}>
					{#each wordCard(game).words as word, wordIndex}
						{@const voteState = optionVoteState(currentState, game, 'pickWord', wordIndex)}
						<button
							class="word-option"
							data-voted={voteState.voted.includes(debugUser)}
							disabled={!canPickWord}
							onclick={() => actor.send({ type: 'vote', action: 'pickWord', option: wordIndex, userId: debugUser })}
							type="button"
						>
							<span class="word-option-label">
								{#if canPickWord}
									<span class="word-text">{word}</span>
								{:else}
									{@render runes(`${game.wordCardId}:${wordIndex}`)}
								{/if}
							</span>
							{@render VoteStack(voteState)}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if canSeeVote(currentState, 'pickQuestions')}
			{@const canPickQuestions = canVote(currentState, game, 'pickQuestions', debugUser)}
			{#if !questionsMinimized}
				<div class="question-popup" transition:fly={{ y: 20, duration: 180 }}>
					<button class="question-popup-toggle" onclick={() => (questionsMinimized = true)} type="button">
						<Minimize2 size={18} />
					</button>
					<div class="question-selector question-selector-popup" data-can-vote={canPickQuestions}>
						{#each currentTeam.questions as qId, questionIndex (qId)}
							{@const q = questions.find(x => x.id === qId)!}
							{@render QuestionChoice(q, questionIndex, canPickQuestions, false)}
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		{#if canSeeVote(currentState, 'clue')}
			{@const clue = getCurrentClue(game)}
			{@const q = currentClueQuestion(game)}
			<div class="clue-stage">
				{#if clue && q}
					<div class="question-card clue-card">
						<span class="question-title">{q.title}</span>
						<span class="question-body clue-body">
							{#if clue.value}
								<span class="clue-value">{clue.value}</span>
							{:else}
								{@render runes(`${q.id}:clue`, { words: 3, min: 3, max: 8 })}
							{/if}
						</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if currentState === 'win' || currentState === 'lose'}
			<div class="question-card result-card" data-result={currentState}>
				<span class="question-title">{currentState === 'win' ? 'Won' : 'Lost'}</span>
				<span class="question-body result-word">{game.word}</span>
				<span class="result-actions">
					<InkButton size="md" primary onclick={() => actor.send({ type: 'start' })}>Reset</InkButton>
				</span>
			</div>
		{/if}
	</div>

	{#if hasActionFooter}
		<div class="action-footer-shell" transition:fly={{ y: 22, duration: 180 }}>
			<footer
				class="action-footer"
				class:keyboard-dock={actionFooterKind === 'keyboard'}
				data-footer-kind={actionFooterKind}
			>
				{#if canSeeVote(currentState, 'mediumAction')}
					<div class="action-buttons">
						{#each votingConfig.mediumAction.choices(game) as option}
							{@const voteState = optionVoteState(currentState, game, 'mediumAction', option)}
							<InkButton
								size="lg"
								primary
								class="flex-1"
								disabled={!canVote(currentState, game, 'mediumAction', debugUser)}
								onclick={() => actor.send({ type: 'vote', action: 'mediumAction', option, userId: debugUser })}
								selfVoted={voteState.voted.includes(debugUser)}
								voteLabel={voteLabel(option)}
								voting={voteState}
							>
								{voteLabel(option)}
							</InkButton>
						{/each}
					</div>
				{:else if canSeeVote(currentState, 'pickQuestions')}
					{@const canPickQuestions = canVote(currentState, game, 'pickQuestions', debugUser)}
					<div class="question-footer-content" data-minimized={questionsMinimized ? 'true' : undefined}>
						{#if questionsMinimized && canPickQuestions}
							<div class="question-footer-tray" transition:fly={{ y: 18, duration: 180 }}>
								<div class="question-selector question-selector-footer" data-can-vote={canPickQuestions}>
									{#each currentTeam.questions as qId, questionIndex (qId)}
										{@const q = questions.find(x => x.id === qId)!}
										{@render QuestionChoice(q, questionIndex, canPickQuestions, true)}
									{/each}
								</div>
								<button class="question-restore-button" onclick={() => (questionsMinimized = false)} type="button">
									<Maximize2 size={18} />
								</button>
							</div>
						{/if}
						{@render QuestionVoteTally()}
					</div>
				{:else if currentState === 'spiritAnswers'}
					{@const canAnswer = canAnswerSpirit(game, debugUser)}
					{@const selectedQuestionId = selectedAnswerQuestionId(game)}
					<form
						class="answer-action-row"
						data-can-answer={canAnswer}
						onsubmit={event => {
							event.preventDefault();
							if (selectedQuestionId) answerClue(selectedQuestionId);
						}}
					>
						<div class="answer-question-options">
							{#each currentTeam.spiritQuestionPicks as qId (qId)}
								{@const q = questions.find(x => x.id === qId)!}
								<button
									class="answer-question-option"
									data-selected={selectedQuestionId === qId}
									disabled={!canAnswer}
									onclick={() => (answerQuestionId = qId)}
									type="button"
								>
									<span class="answer-question-title">{q.title}</span>
									<span class="answer-question-body">{q.question}</span>
								</button>
							{/each}
						</div>
						<div class="answer-input-row">
							<input
								disabled={!canAnswer || !selectedQuestionId}
								oninput={event => {
									if (selectedQuestionId) clueDrafts[selectedQuestionId] = event.currentTarget.value;
								}}
								placeholder="Clue"
								value={selectedQuestionId ? (clueDrafts[selectedQuestionId] ?? '') : ''}
							/>
							<InkButton
								size="sm"
								primary
								type="submit"
								disabled={!canAnswer || !selectedQuestionId || !clueDrafts[selectedQuestionId]?.trim()}
							>
								Seal
							</InkButton>
						</div>
					</form>
				{:else if canSeeVote(currentState, 'clue')}
					<div class="action-buttons clue-buttons">
						{#each votingConfig.clue.choices(game) as option}
							{@const voteState = optionVoteState(currentState, game, 'clue', option)}
							<InkButton
								size="lg"
								primary={option === 'getClue'}
								class="flex-1"
								disabled={!canVote(currentState, game, 'clue', debugUser)}
								onclick={() => actor.send({ type: 'vote', action: 'clue', option, userId: debugUser })}
								selfVoted={voteState.voted.includes(debugUser)}
								voteLabel={voteLabel(option)}
								voting={voteState}
							>
								{option === 'getClue' ? 'Reveal' : 'Silencio'}
							</InkButton>
						{/each}
					</div>
				{:else if canSeeVote(currentState, 'guessLetter')}
					{@const canGuess = canVote(currentState, game, 'guessLetter', debugUser)}
					<div class="ansi-keyboard" data-can-vote={canGuess}>
						{#each config.keyboardRows as row, rowIndex (rowIndex)}
							<div class="keyboard-row" data-row={rowIndex}>
								{#each row as option (option)}
									{@const voteState = optionVoteState(currentState, game, 'guessLetter', option)}
									<button
										aria-pressed={voteState.voted.includes(debugUser)}
										class="key-button"
										class:space-key={option === ' '}
										data-key={option === ' ' ? 'space' : option}
										data-voted={voteState.voted.includes(debugUser)}
										disabled={!canGuess}
										onclick={() => actor.send({ type: 'vote', action: 'guessLetter', option, userId: debugUser })}
										type="button"
									>
										{@render VoteDots(voteState)}
										<span class="key-face">{voteLabel(option)}</span>
									</button>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</footer>
		</div>
	{/if}
</div>

<style>
	.debug-game {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: 0;
		color: var(--app-text);
		overflow: hidden;
	}

	:global(.content-card:has(.debug-game)) {
		height: calc(100dvh - 6.4rem);
		max-height: calc(100dvh - 6.4rem);
		padding: 0;
		overflow: hidden;
	}

	.game-content {
		position: relative;
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
		min-height: 0;
		flex: 1 1 0;
		padding: 1rem;
		overflow-x: clip;
		overflow-y: auto;
	}

	.debug-game[data-state='mediumsAsk']:not([data-questions-minimized='true']) .game-content {
		overflow: hidden;
	}

	.board {
		min-width: 0;
		max-width: 100%;
		overflow-x: clip;
	}

	.board-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2rem minmax(0, 1fr);
		align-items: center;
		border-bottom: 1px solid var(--app-border);
		& > * {
			min-width: 0;
			display: flex;
			align-items: center;
			padding: 0.25rem 0;
			gap: 0.5rem;
		}
	}

	.board-row-group {
		display: grid;
		min-width: 0;
	}

	.board-row-toggle-slot,
	.row-question-toggle {
		justify-content: center;
		width: 2rem;
		min-width: 2rem;
		min-height: 2rem;
		padding: 0;
	}

	.row-question-toggle {
		position: relative;
		border: 0;
		background: transparent;
		color: var(--app-muted);
		cursor: pointer;
	}

	.row-question-toggle:disabled {
		cursor: default;
		opacity: 1;
	}

	.row-toggle-icon {
		position: absolute;
		inset: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transform: scale(0.72) rotate(-24deg);
		transition:
			opacity 140ms ease,
			transform 180ms ease,
			color 140ms ease;
	}

	.board-row-group[data-has-known='true']:hover .row-toggle-icon,
	.board-row-group[data-expanded='true'] .row-toggle-icon {
		opacity: 1;
		transform: scale(1) rotate(0deg);
	}

	.board-row-group[data-expanded='true'] .row-toggle-icon {
		color: var(--logo-word);
	}

	.board-cell {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
		min-height: 2rem;
		border: 0;
		border-radius: 0.35rem;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 1.125rem;
		letter-spacing: 2px;
		padding: 0.5rem 0;
		text-align: left;
		text-transform: uppercase;
	}

	.board-value {
		display: inline-flex;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.board-value[data-letter-hint='true'] {
		color: color-mix(in oklab, var(--app-accent-strong) 74%, var(--logo-word) 26%);
		font-weight: 950;
		text-shadow:
			0 0 0.55rem color-mix(in oklab, var(--app-accent) 26%, transparent),
			0 0.12rem 0.26rem color-mix(in oklab, black 42%, transparent);
	}

	.board-value[data-eye-hint='true'] {
		color: var(--logo-word);
		text-shadow:
			0 0 0.72rem color-mix(in oklab, var(--app-focus) 34%, transparent),
			0 0.12rem 0.28rem color-mix(in oklab, black 44%, transparent);
	}

	.board-value.done {
		color: color-mix(in oklab, var(--logo-word) 82%, white 18%);
	}

	.guess-valid {
		color: color-mix(in oklab, var(--app-text) 88%, var(--app-muted) 12%);
	}

	.guess-invalid {
		color: var(--app-error);
		font-weight: 950;
		text-shadow:
			0 0 0.55rem color-mix(in oklab, var(--app-error) 42%, transparent),
			0 0.12rem 0.25rem color-mix(in oklab, black 46%, transparent);
	}

	button.board-cell {
		cursor: pointer;
		overflow: visible;
		transition:
			background 180ms ease,
			box-shadow 200ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	button.board-cell:hover:not(:disabled),
	button.board-cell:focus-visible,
	button.board-cell[data-voted='true'] {
		background: color-mix(in oklab, var(--app-focus) 12%, transparent);
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--app-focus) 36%, transparent),
			0 0 0.8rem color-mix(in oklab, var(--app-focus) 18%, transparent);
		color: var(--logo-word);
	}

	button.board-cell[data-hint-target='true'] {
		--cell-pulse-color: var(--app-focus);
	}

	.board-cell[data-guess-target='true'] {
		--cell-pulse-color: var(--app-muted);
		background: color-mix(in oklab, var(--app-muted) 9%, transparent);
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--app-muted) 26%, transparent),
			inset 0 0 0.7rem color-mix(in oklab, var(--app-muted) 10%, transparent);
	}

	button.board-cell[data-hint-target='true']::after,
	.board-cell[data-guess-target='true']::after {
		position: absolute;
		inset: 0.08rem;
		border: 1px solid color-mix(in oklab, var(--cell-pulse-color) 72%, transparent);
		border-radius: 0.3rem;
		box-shadow:
			inset 0 0 0.85rem color-mix(in oklab, var(--cell-pulse-color) 18%, transparent),
			inset 0 0 0.5rem color-mix(in oklab, var(--cell-pulse-color) 12%, transparent);
		pointer-events: none;
		content: '';
		animation: hint-cell-wobble 1500ms ease-in-out infinite;
	}

	@keyframes hint-cell-wobble {
		0%,
		100% {
			opacity: 0.68;
			transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
		}
		25% {
			opacity: 1;
			transform: translate3d(0.04rem, -0.03rem, 0) rotate(0.7deg) scale(1.015);
		}
		55% {
			opacity: 0.86;
			transform: translate3d(-0.05rem, 0.02rem, 0) rotate(-0.6deg) scale(0.995);
		}
		78% {
			opacity: 1;
			transform: translate3d(0.02rem, 0.04rem, 0) rotate(0.35deg) scale(1.01);
		}
	}

	.board-eye-space {
		width: 24px;
		height: 24px;
		flex: 0 0 auto;
	}

	.board-cell > .vote-stack {
		justify-content: flex-end;
		min-width: 1.8rem;
		height: 1.35rem;
		margin-left: auto;
	}

	.board-cell.flex-row-reverse > .vote-stack {
		margin-right: auto;
		margin-left: 0;
	}

	.board-cell .vote-ghost :global(.avatar) {
		font-size: 1.12rem;
	}

	.row-question-popover {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0;
		border-bottom: 1px solid color-mix(in oklab, var(--app-border) 72%, transparent);
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-focus) 7%, transparent), transparent),
			color-mix(in oklab, var(--app-panel) 72%, transparent);
		padding: 0.45rem 0;
	}

	.row-question-column {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
		border-block: 1px solid color-mix(in oklab, var(--app-border) 62%, transparent);
		background: color-mix(in oklab, var(--app-input) 34%, transparent);
		padding: 0.45rem;
	}

	.row-question-column[data-team='sun'] {
		border-left: 1px solid color-mix(in oklab, var(--app-border) 62%, transparent);
		border-radius: 0.375rem 0 0 0.375rem;
	}

	.row-question-column[data-team='moon'] {
		border-right: 1px solid color-mix(in oklab, var(--app-border) 62%, transparent);
		border-left: 1px solid color-mix(in oklab, var(--app-border) 42%, transparent);
		border-radius: 0 0.375rem 0.375rem 0;
	}

	.known-question {
		--known-question-color: var(--app-muted);
		display: grid;
		grid-template-columns: 1rem minmax(0, 1fr);
		align-items: start;
		gap: 0.35rem;
		min-width: 0;
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0;
		line-height: 1.24;
		text-transform: none;
	}

	.known-question + .known-question {
		border-top: 1px solid color-mix(in oklab, var(--app-border) 58%, transparent);
		padding-top: 0.35rem;
	}

	.known-question-icon {
		display: inline-flex;
		justify-content: center;
		margin-top: 0.06rem;
		color: var(--known-question-color);
		filter: drop-shadow(0 0 0.35rem color-mix(in oklab, var(--known-question-color) 34%, transparent));
	}

	.known-question[data-kind='used'] {
		--known-question-color: color-mix(in oklab, #34f077 84%, var(--logo-word) 16%);
	}

	.known-question[data-kind='discarded'] {
		--known-question-color: color-mix(in oklab, #ff4f6d 88%, var(--app-error) 12%);
	}

	.known-question-copy {
		min-width: 0;
		color: color-mix(in oklab, var(--app-text) 86%, var(--app-muted) 14%);
	}

	.known-question-copy strong {
		color: var(--known-question-color);
		font: inherit;
		font-weight: 850;
		letter-spacing: 0;
		text-shadow: 0 0 0.45rem color-mix(in oklab, var(--known-question-color) 24%, transparent);
	}

	.known-question-empty {
		min-height: 0.35rem;
	}

	button,
	select {
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
		flex: 0 0 auto;
		border-bottom: 1px solid var(--app-border);
		padding: 0.8rem 1rem;
	}

	.team-toggle {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.team-toggle button {
		background: transparent;
	}

	.active-toggle {
		background: color-mix(in srgb, var(--app-accent) 16%, transparent) !important;
	}

	.action-footer-shell {
		flex: 0 0 auto;
		z-index: 40;
		overflow: hidden;
	}

	.action-footer {
		border-top: 1px solid var(--app-border);
		background: var(--app-panel);
		box-shadow: 0 -0.22rem 0.7rem color-mix(in srgb, black 14%, transparent);
		overflow: hidden;
		padding: 0.5rem 1rem;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.question-footer-content {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}

	.question-footer-tray {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 0.5rem;
		min-width: 0;
	}

	.question-popup-toggle,
	.question-restore-button {
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 72%, transparent);
		border-radius: 0.35rem;
		background: color-mix(in oklab, var(--app-input) 78%, transparent);
		color: var(--app-text);
		cursor: pointer;
		padding: 0;
		transition:
			background 160ms ease,
			border-color 160ms ease,
			color 160ms ease,
			transform 160ms ease;
	}

	.question-popup-toggle:hover,
	.question-popup-toggle:focus-visible,
	.question-restore-button:hover,
	.question-restore-button:focus-visible {
		border-color: color-mix(in oklab, var(--app-focus) 58%, var(--app-border) 42%);
		background: color-mix(in oklab, var(--app-focus) 14%, var(--app-input));
		color: var(--logo-word);
		transform: translateY(-0.08rem);
	}

	.question-vote-tally {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.7rem;
		min-width: 0;
		border-top: 1px solid color-mix(in oklab, var(--app-border) 54%, transparent);
		padding-top: 0.45rem;
	}

	.question-vote-row {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		color: color-mix(in oklab, var(--app-text) 86%, var(--app-muted) 14%);
		font-size: 0.76rem;
		font-weight: 750;
		line-height: 1;
	}

	.question-vote-label {
		color: color-mix(in oklab, var(--logo-word) 84%, white 16%);
		font-family: var(--font-fancy);
		font-weight: 950;
		white-space: nowrap;
	}

	.question-vote-avatars {
		display: inline-flex;
		align-items: center;
		min-width: 1rem;
		min-height: 1.2rem;
	}

	.question-voter {
		display: inline-flex;
	}

	.question-voter + .question-voter {
		margin-left: -0.18rem;
	}

	.question-voter :global(.avatar) {
		font-size: 1rem;
		filter: drop-shadow(0 0.16rem 0.25rem color-mix(in oklab, black 42%, transparent));
	}

	.answer-action-row {
		display: grid;
		gap: 0.55rem;
	}

	.answer-question-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.answer-question-option {
		display: grid;
		gap: 0.16rem;
		min-width: 0;
		border: 1px solid color-mix(in oklab, var(--app-border) 70%, transparent);
		border-radius: 0.375rem;
		background: color-mix(in oklab, var(--app-input) 58%, transparent);
		color: inherit;
		cursor: pointer;
		padding: 0.45rem 0.55rem;
		text-align: left;
	}

	.answer-question-option:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.answer-question-option[data-selected='true'] {
		border-color: color-mix(in oklab, var(--app-focus) 60%, var(--app-border) 40%);
		background: color-mix(in oklab, var(--app-focus) 16%, var(--app-input));
		box-shadow: 0 0 0.8rem color-mix(in oklab, var(--app-focus) 14%, transparent);
		color: var(--logo-word);
	}

	.answer-question-title {
		overflow: hidden;
		font-family: var(--font-fancy);
		font-size: 0.9rem;
		font-weight: 900;
		line-height: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.answer-question-body {
		overflow: hidden;
		color: color-mix(in oklab, var(--app-text) 84%, var(--app-muted) 16%);
		font-size: 0.72rem;
		font-weight: 650;
		line-height: 1.18;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.state-panel {
		display: grid;
		justify-items: center;
		gap: 1rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 74%, var(--app-accent) 26%);
		border-radius: 0.5rem;
		background:
			radial-gradient(100% 120% at 50% -10%, color-mix(in oklab, var(--app-accent) 18%, transparent), transparent 56%),
			color-mix(in oklab, var(--app-panel) 92%, transparent);
		box-shadow:
			0 1rem 2.4rem color-mix(in oklab, black 38%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 8%, transparent);
		padding: 1.2rem;
	}

	.panel-runes {
		display: flex;
		justify-content: center;
		max-width: 100%;
	}

	.pick-word {
		position: relative;
		display: grid;
		gap: 0.55rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 76%, var(--app-accent) 24%);
		border-radius: 0.5rem;
		background:
			radial-gradient(120% 80% at 12% -8%, color-mix(in oklab, var(--app-sun) 28%, transparent), transparent 48%),
			radial-gradient(110% 90% at 94% 112%, color-mix(in oklab, var(--app-moon) 32%, transparent), transparent 54%),
			linear-gradient(160deg, color-mix(in oklab, var(--app-panel) 90%, white 10%), var(--app-panel) 58%),
			var(--app-panel);
		box-shadow:
			0 1.25rem 3rem color-mix(in oklab, black 46%, transparent),
			0 0.28rem 0 color-mix(in oklab, black 28%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 12%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 34%, transparent);
		padding: 0.8rem;
		overflow: hidden;
		transform: translateY(0) scale(1);
		transform-style: preserve-3d;
		transition:
			border-color 220ms ease,
			box-shadow 260ms ease,
			filter 260ms ease,
			transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.pick-word-stage {
		position: relative;
		z-index: 3;
		width: min(100%, 24rem);
		margin: 0 auto;
		perspective: 58rem;
	}

	.debug-game[data-state='setupWord'] .pick-word-stage {
		position: absolute;
		top: clamp(8.75rem, 25dvh, 10.75rem);
		left: 50%;
		width: min(calc(100% - 1rem), 24rem);
		transform: translateX(-50%);
	}

	.pick-word-stage:hover .pick-word,
	.pick-word-stage:focus-within .pick-word,
	button.question-card:hover,
	button.question-card:focus-visible {
		border-color: color-mix(in oklab, var(--app-focus) 54%, var(--app-border) 46%);
		box-shadow:
			0 1.7rem 3.6rem color-mix(in oklab, black 52%, transparent),
			0 0.42rem 0 color-mix(in oklab, black 32%, transparent),
			0 0 1.4rem color-mix(in oklab, var(--app-accent) 18%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 16%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 38%, transparent);
		filter: saturate(1.08);
		transform: translateY(-0.32rem) scale(1.008);
	}

	.pick-word::before {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(110deg, transparent 0 24%, color-mix(in oklab, white 12%, transparent) 32%, transparent 42%),
			repeating-linear-gradient(28deg, color-mix(in oklab, white 4%, transparent) 0 1px, transparent 1px 6px);
		opacity: 0.45;
		pointer-events: none;
		transform: translateZ(1.25rem);
		content: '';
	}

	.pick-word::after {
		position: absolute;
		inset: auto 0 0;
		height: 0.45rem;
		background: linear-gradient(180deg, transparent, color-mix(in oklab, black 38%, transparent));
		pointer-events: none;
		content: '';
	}

	button.word-option {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 3rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 72%, transparent);
		border-radius: 0.375rem;
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-input) 86%, white 8%), var(--app-input)), var(--app-input);
		box-shadow:
			0 0.32rem 0.9rem color-mix(in oklab, black 22%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 8%, transparent);
		color: var(--app-text);
		cursor: pointer;
		font: inherit;
		padding: 0.62rem 0.8rem;
		text-align: left;
		transform: translateZ(0.65rem);
		transform-style: preserve-3d;
		transition:
			background 200ms ease,
			border-color 200ms ease,
			box-shadow 220ms ease,
			color 180ms ease,
			transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	button.word-option:hover:not(:disabled),
	button.word-option:focus-visible {
		border-color: color-mix(in oklab, var(--app-focus) 58%, var(--app-accent) 42%);
		background:
			radial-gradient(90% 120% at 12% 0%, color-mix(in oklab, var(--app-sun) 18%, transparent), transparent 48%),
			linear-gradient(
				180deg,
				color-mix(in oklab, var(--app-input) 78%, var(--app-accent) 22%),
				color-mix(in oklab, var(--app-input) 88%, black 12%)
			);
		box-shadow:
			0 0.8rem 1.5rem color-mix(in oklab, black 30%, transparent),
			0 0 0.95rem color-mix(in oklab, var(--app-accent) 18%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 12%, transparent);
		transform: translateX(0.18rem) translateZ(1.55rem) scale(1.015);
	}

	button.word-option:active:not(:disabled) {
		transform: translateX(0.08rem) translateZ(0.35rem) scale(0.99);
	}

	button.word-option:disabled {
		opacity: 1;
		cursor: default;
	}

	.pick-word[data-can-vote='false'] .word-option {
		pointer-events: none;
	}

	button.word-option[data-voted='true'] {
		border-color: color-mix(in oklab, var(--app-focus) 62%, var(--app-sun) 38%);
		box-shadow:
			0 0.7rem 1.4rem color-mix(in oklab, black 30%, transparent),
			0 0 1rem color-mix(in oklab, var(--app-focus) 20%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 14%, transparent);
		color: var(--logo-word);
	}

	.word-option-label {
		display: flex;
		align-items: center;
		min-width: 0;
		flex: 1 1 auto;
	}

	.word-text {
		overflow: hidden;
		font-family: 'Palatino Linotype', Georgia, var(--font-sans), serif;
		font-size: 1.18rem;
		font-weight: 800;
		line-height: 1.05;
		text-overflow: ellipsis;
		text-shadow: 0 0.18rem 0.45rem color-mix(in oklab, black 34%, transparent);
		white-space: nowrap;
	}

	.vote-stack {
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		height: 1.6rem;
		min-width: 2.6rem;
		flex: 0 0 auto;
		overflow: visible;
		pointer-events: none;
	}

	.vote-ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		will-change: opacity, transform;
	}

	.vote-ghost + .vote-ghost {
		margin-left: -0.22rem;
	}

	.vote-ghost :global(.avatar) {
		font-size: 1.45rem;
		filter: drop-shadow(0 0.22rem 0.38rem color-mix(in oklab, black 42%, transparent))
			drop-shadow(0 0 0.5rem color-mix(in oklab, var(--app-focus) 18%, transparent));
	}

	.vote-dots {
		position: absolute;
		top: 0.26rem;
		left: 50%;
		display: flex;
		gap: 0.15rem;
		justify-content: center;
		max-width: calc(100% - 0.45rem);
		pointer-events: none;
		transform: translateX(-50%);
	}

	.vote-dot {
		width: 0.34rem;
		height: 0.34rem;
		border-radius: 999px;
		background: var(--vote-color);
		box-shadow:
			0 0 0.28rem color-mix(in oklab, var(--vote-color) 82%, transparent),
			0 0.1rem 0.22rem color-mix(in oklab, black 48%, transparent);
	}

	.rune-word {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.22em 0.38em;
		max-width: 100%;
		min-width: 0;
		color: color-mix(in oklab, var(--app-accent-strong) 72%, var(--app-focus) 28%);
		font-family: var(--font-mono);
		font-size: 1.22rem;
		font-weight: 800;
		line-height: 1;
		text-shadow:
			0 0 0.45rem color-mix(in oklab, var(--app-accent) 42%, transparent),
			0 0.12rem 0.3rem color-mix(in oklab, black 42%, transparent);
	}

	.rune-group {
		display: inline-flex;
		gap: 0.08em;
		max-width: 100%;
		min-width: 0;
	}

	.rune {
		display: inline-block;
		animation: rune-dance calc(var(--rune-duration) * 1.45) ease-in-out infinite;
		animation-delay: var(--rune-delay);
		transform-origin: center 58%;
		will-change: filter, opacity, transform;
	}

	.rune:nth-child(3n + 2) {
		animation-name: rune-swap;
	}

	.rune:nth-child(3n) {
		animation-name: rune-float;
	}

	.question-selector {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		align-items: stretch;
		gap: 0.8rem;
		overflow: visible;
		perspective: 58rem;
	}

	.question-popup {
		position: absolute;
		inset: 0;
		z-index: 30;
		display: grid;
		min-width: 0;
		min-height: 0;
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-bg) 34%, transparent), transparent),
			color-mix(in oklab, var(--app-panel) 94%, transparent);
		padding: 0.75rem;
	}

	.question-popup-toggle {
		position: absolute;
		bottom: 0.65rem;
		right: 0.65rem;
		z-index: 3;
	}

	.question-selector-popup {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: minmax(0, 1fr);
		gap: 0.55rem;
		height: 100%;
		min-height: 0;
		overflow: visible;
	}

	.question-selector-footer {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.75rem), 1fr));
		gap: 0.45rem;
		max-height: min(26dvh, 12rem);
		min-width: 0;
		padding: 0.2rem;
		overflow-y: auto;
	}

	.question-card {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 13.5rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 76%, var(--app-accent) 24%);
		border-radius: 0.5rem;
		background:
			radial-gradient(110% 85% at 14% -8%, color-mix(in oklab, var(--app-sun) 18%, transparent), transparent 50%),
			radial-gradient(120% 100% at 96% 112%, color-mix(in oklab, var(--app-moon) 24%, transparent), transparent 56%),
			linear-gradient(160deg, color-mix(in oklab, var(--app-panel) 90%, white 10%), var(--app-panel) 58%),
			var(--app-panel);
		box-shadow:
			0 1.25rem 3rem color-mix(in oklab, black 46%, transparent),
			0 0.28rem 0 color-mix(in oklab, black 28%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 12%, transparent),
			inset 0 -1px 0 color-mix(in oklab, black 34%, transparent);
		color: var(--app-text);
		cursor: default;
		overflow: hidden;
		padding: 0;
		text-align: left;
		transform: translateY(0) scale(1);
		transform-style: preserve-3d;
		transition:
			border-color 220ms ease,
			box-shadow 260ms ease,
			color 180ms ease,
			filter 260ms ease,
			transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.question-selector-popup .question-card {
		height: 100%;
		min-height: 0;
	}

	.question-card-compact {
		min-height: 5.6rem;
	}

	button.question-card {
		cursor: pointer;
	}

	.question-card::before {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(110deg, transparent 0 24%, color-mix(in oklab, white 11%, transparent) 32%, transparent 42%),
			repeating-linear-gradient(28deg, color-mix(in oklab, white 4%, transparent) 0 1px, transparent 1px 6px);
		opacity: 0.4;
		pointer-events: none;
		transform: translateZ(1.25rem);
		content: '';
	}

	button.question-card:disabled {
		cursor: default;
		opacity: 1;
	}

	button.question-card:active:not(:disabled) {
		transform: translateY(-0.08rem) scale(0.995);
	}

	button.question-card[data-voted='true'] {
		border-color: color-mix(in oklab, var(--app-focus) 62%, var(--app-sun) 38%);
		box-shadow:
			0 1.45rem 3.15rem color-mix(in oklab, black 48%, transparent),
			0 0 0 1px color-mix(in oklab, var(--app-focus) 26%, transparent),
			0 0 1.1rem color-mix(in oklab, var(--app-focus) 22%, transparent),
			0 0.32rem 0 color-mix(in oklab, black 30%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 14%, transparent);
		color: var(--logo-word);
	}

	.question-title,
	.question-body {
		position: relative;
		z-index: 1;
	}

	.question-title {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 3.2rem;
		border-bottom: 1px solid color-mix(in oklab, var(--app-border) 76%, transparent);
		background: color-mix(in oklab, var(--app-input) 44%, transparent);
		font-family: var(--font-fancy);
		font-size: 1.18rem;
		font-weight: 900;
		line-height: 1.08;
		overflow: hidden;
		padding: 0.7rem 0.85rem 0.62rem;
		text-align: center;
		text-shadow: 0 0.18rem 0.42rem color-mix(in oklab, black 34%, transparent);
		transform: translateZ(0.7rem);
	}

	.question-title-text {
		position: relative;
		z-index: 1;
		min-width: 0;
	}

	.question-title-votes {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		background: linear-gradient(
			90deg,
			transparent 0 24%,
			color-mix(in oklab, black 52%, transparent) 62%,
			color-mix(in oklab, black 76%, transparent)
		);
		padding: 0.25rem 0.55rem 0.25rem 42%;
		pointer-events: none;
		transform: translateZ(1rem);
		will-change: opacity;
	}

	.question-title-votes .vote-stack {
		justify-content: flex-end;
		width: auto;
		min-width: 0;
		height: auto;
	}

	.question-title-votes .vote-ghost :global(.avatar) {
		font-size: 1.22rem;
	}

	.question-selector-popup .question-title {
		min-height: 2.25rem;
		font-size: 0.9rem;
		padding: 0.52rem 0.62rem 0.45rem;
	}

	.question-card-compact .question-title {
		min-height: 1.7rem;
		font-size: 0.72rem;
		padding: 0.34rem 0.5rem 0.3rem;
	}

	button.question-card[data-voted='true'] .question-title {
		background: color-mix(in oklab, var(--app-focus) 14%, var(--app-input));
	}

	.question-body {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 7.15rem;
		flex: 1 1 0;
		color: color-mix(in oklab, var(--app-text) 88%, var(--app-muted) 12%);
		font-size: 1.06rem;
		font-weight: 650;
		line-height: 1.26;
		padding: 0.85rem 0.95rem;
		text-align: center;
		text-wrap: balance;
		transform: translateZ(0.45rem);
	}

	.question-selector-popup .question-body {
		min-height: 0;
		font-size: 1.08rem;
		line-height: 1.22;
		padding: 0.7rem 0.85rem;
		overflow: hidden;
	}

	.question-card-compact .question-body {
		min-height: 0;
		font-size: 0.84rem;
		font-weight: 500;
		line-height: 1.18;
		padding: 0.52rem 0.62rem;
		overflow: hidden;
	}

	.question-card-compact .question-title-votes .vote-ghost :global(.avatar) {
		font-size: 1rem;
	}

	.question-body .rune-word {
		font-size: 1.06rem;
		line-height: 1.28;
	}

	.clue-value,
	.result-word {
		font-family: var(--font-fancy);
		font-weight: 950;
		letter-spacing: 0;
		text-shadow:
			0 0 0.65rem color-mix(in oklab, var(--app-focus) 28%, transparent),
			0 0.2rem 0.42rem color-mix(in oklab, black 42%, transparent);
	}

	.clue-value {
		font-size: clamp(1.4rem, 7vw, 2rem);
		line-height: 1;
		text-align: center;
	}

	.clue-stage {
		display: grid;
		gap: 0.85rem;
	}

	.answer-input-row {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.5rem;
		align-items: center;
	}

	.answer-input-row input {
		min-width: 0;
		height: 2.2rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 74%, transparent);
		border-radius: 0.375rem;
		background: color-mix(in oklab, var(--app-input) 86%, black 6%);
		color: var(--app-text);
		font: inherit;
		font-weight: 800;
		padding: 0 0.7rem;
	}

	.answer-input-row input:focus-visible {
		outline: 2px solid var(--app-focus);
		outline-offset: 2px;
	}

	.answer-input-row input:disabled {
		opacity: 0.55;
	}

	.clue-stage {
		width: min(100%, 30rem);
		margin: 0 auto;
	}

	.clue-card {
		min-height: 11rem;
	}

	.clue-body .rune-word {
		font-size: 1.18rem;
	}

	.clue-buttons {
		align-items: stretch;
	}

	.keyboard-dock {
		background:
			radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, var(--app-moon) 20%, transparent), transparent 56%),
			color-mix(in oklab, var(--app-panel) 94%, transparent);
		padding-block: 0.65rem 0.75rem;
	}

	.ansi-keyboard {
		display: grid;
		gap: 0.375rem;
		min-width: 0;
		font-family: var(--font-mono);
	}

	.keyboard-row {
		display: flex;
		justify-content: center;
		gap: clamp(0.18rem, 1.6vw, 0.375rem);
		min-width: 0;
	}

	button.key-button {
		position: relative;
		display: grid;
		place-items: end center;
		width: clamp(1.42rem, 7.3vw, 2.55rem);
		min-width: 0;
		height: clamp(2.35rem, 10vw, 3rem);
		border: 1px solid color-mix(in oklab, var(--app-border) 68%, var(--app-accent) 32%);
		border-radius: 0.35rem;
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-input) 82%, white 8%), var(--app-input) 62%),
			var(--app-input);
		box-shadow:
			0 0.26rem 0 color-mix(in oklab, black 34%, transparent),
			0 0.52rem 0.9rem color-mix(in oklab, black 26%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 10%, transparent);
		color: var(--app-text);
		cursor: pointer;
		font: inherit;
		font-weight: 950;
		line-height: 1;
		padding: 0.4rem 0.25rem 0.48rem;
		text-align: center;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			box-shadow 200ms ease,
			color 180ms ease,
			transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	button.key-button.space-key {
		width: min(13rem, 72%);
	}

	button.key-button:hover:not(:disabled),
	button.key-button:focus-visible {
		border-color: color-mix(in oklab, var(--app-focus) 56%, var(--app-accent) 44%);
		box-shadow:
			0 0.34rem 0 color-mix(in oklab, black 32%, transparent),
			0 0.78rem 1.2rem color-mix(in oklab, black 32%, transparent),
			0 0 0.72rem color-mix(in oklab, var(--app-focus) 16%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 14%, transparent);
		transform: translateY(-0.12rem);
	}

	button.key-button:active:not(:disabled) {
		box-shadow:
			0 0.08rem 0 color-mix(in oklab, black 36%, transparent),
			0 0.28rem 0.54rem color-mix(in oklab, black 28%, transparent),
			inset 0 1px 0 color-mix(in oklab, black 18%, transparent);
		transform: translateY(0.1rem);
	}

	button.key-button[data-voted='true'] {
		border-color: color-mix(in oklab, var(--app-focus) 64%, var(--app-accent) 36%);
		box-shadow:
			0 0.3rem 0 color-mix(in oklab, black 32%, transparent),
			0 0 0.95rem color-mix(in oklab, var(--app-focus) 24%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 14%, transparent);
		color: var(--logo-word);
	}

	button.key-button:disabled {
		cursor: default;
		opacity: 0.74;
	}

	.key-face {
		text-transform: uppercase;
	}

	.result-card {
		width: min(100%, 22rem);
		min-height: 12rem;
		margin: 0 auto;
	}

	.result-card[data-result='win'] {
		border-color: color-mix(in oklab, var(--app-focus) 58%, var(--app-border) 42%);
	}

	.result-word {
		color: var(--logo-word);
		font-size: clamp(1.6rem, 8vw, 2.35rem);
	}

	.result-actions {
		position: relative;
		z-index: 1;
		display: flex;
		justify-content: center;
		border-top: 1px solid color-mix(in oklab, var(--app-border) 64%, transparent);
		padding: 0.7rem;
		transform: translateZ(0.75rem);
	}

	@keyframes rune-dance {
		0%,
		100% {
			filter: brightness(1);
			opacity: 0.78;
			transform: translate3d(0, 0, 0.2rem) rotate(0deg);
		}
		28% {
			filter: brightness(1.12);
			opacity: 0.96;
			transform: translate3d(calc(var(--rune-drift) * 0.26ch), -0.1rem, 0.45rem) rotate(3deg);
		}
		58% {
			filter: brightness(0.92);
			opacity: 0.86;
			transform: translate3d(calc(var(--rune-drift) * -0.2ch), 0.08rem, 0.24rem) rotate(-3deg);
		}
	}

	@keyframes rune-swap {
		0%,
		100% {
			filter: brightness(0.95);
			opacity: 0.76;
			transform: translate3d(0, 0.04rem, 0.1rem) rotate(0deg);
		}
		35% {
			filter: brightness(1.1);
			opacity: 0.96;
			transform: translate3d(calc(var(--rune-drift) * -0.3ch), -0.07rem, 0.44rem) rotate(-4deg);
		}
		68% {
			filter: brightness(1.02);
			opacity: 0.9;
			transform: translate3d(calc(var(--rune-drift) * 0.24ch), 0.09rem, 0.28rem) rotate(3deg);
		}
	}

	@keyframes rune-float {
		0%,
		100% {
			filter: brightness(1);
			opacity: 0.8;
			transform: translate3d(0, 0, 0.2rem) rotate(0deg) scale(1);
		}
		42% {
			filter: brightness(1.12);
			opacity: 0.96;
			transform: translate3d(calc(var(--rune-drift) * 0.18ch), -0.14rem, 0.48rem) rotate(3deg) scale(1.04);
		}
		72% {
			filter: brightness(0.9);
			opacity: 0.82;
			transform: translate3d(calc(var(--rune-drift) * -0.16ch), 0.07rem, 0.24rem) rotate(-2deg) scale(0.99);
		}
	}

	@media (min-width: 700px) {
		:global(.content-card:has(.debug-game)) {
			height: min(calc(100dvh - 6.4rem), 50rem);
			max-height: min(calc(100dvh - 6.4rem), 50rem);
		}
	}

	@media (max-width: 420px) {
		:global(.content-card:has(.debug-game)) {
			height: calc(100dvh - 5.7rem);
			max-height: calc(100dvh - 5.7rem);
		}
	}

	@media (max-width: 460px) {
		.debug-game[data-state='setupWord'] .pick-word-stage {
			top: 8.5rem;
			width: min(calc(100% - 0.25rem), 22rem);
		}

		.pick-word {
			gap: 0.45rem;
			padding: 0.65rem;
		}

		button.word-option {
			min-height: 2.75rem;
			padding: 0.56rem 0.65rem;
		}

		.word-text,
		.rune-word {
			font-size: 1.03rem;
		}
	}
</style>
