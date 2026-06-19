<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import { Eye } from '@lucide/svelte';
	import { board, questions, words, type QuestionCard, type WordCard } from '@repo/shared/data';
	import type { User } from '@repo/shared/onlineGame';
	import type { Team } from '@repo/shared/types';
	import { range, sample, shuffle, uniq } from 'es-toolkit';
	import { produce } from 'immer';
	import { onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
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
	};
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
		| { type: 'debugSetTeam'; team: Team };

	const teams = ['sun', 'moon'] as const;
	const config = {
		questionsInHand: 7,
		questionsGivenToSpirit: 2,
		alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
		runes: 'ᚡᚢᚣᚤᚥᚦᚧᚩᚫᚭᚮᚯᚱᚲᚳᚴᚵᚶᚷᚸᚹᚺᚻᚼᚽᚾᚿᛀᛁᛂᛃᛄᛅᛆᛇᛈᛉᛊᛋᛏᛐᛑᛒᛓᛔᛗᛘᛙᛚᛛᛜᛝᛞᛟᛠᛡᛢᛣᛤᛥᛦᛨᛩᛪ'.split(''),
	} as const;

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
			choices: () => ['getClue', 'silencio'],
			event: (_ctx: GameContext, [option]: VoteOption[]) =>
				option === 'getClue' || option === 'silencio' ? { type: option } : null,
		},
		guessLetter: {
			activeState: 'guessing',
			mode: 'activeMedium',
			count: 1,
			choices: () => config.alphabet,
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

					team.board.push({
						type: 'clue',
						value: '',
						fullValue: sanitizePhrase(event.clue),
						questionId,
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
			debugSetTeam: assign(({ event }) =>
				event.type === 'debugSetState' || event.type === 'debugSetTeam' ? { currentTeam: event.team } : {},
			),
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

	function createTeamState(players: Array<User['id']>): TeamState {
		return {
			spirit: sample(players),
			players,
			questions: [],
			spiritQuestionPicks: [],
			board: [],
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

	function isBoardEntryInvalid(context: GameContext, entry: BoardEntry | undefined): boolean {
		return Boolean(entry?.type === 'guess' && entry.value && !context.word.startsWith(entry.value));
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
		return String(option).replace(/^\w/, match => match.toUpperCase());
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
			.trim()
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

	actor.send({
		type: 'debugSetState',
		state: 'mediumsTurn', // to trigger questions draw
		team: 'sun',
	});
	actor.send({
		type: 'debugSetState',
		state: 'mediumsAsk',
		team: 'sun',
	});

	const currentTeam = $derived(snapshot.context.teams[snapshot.context.currentTeam]);
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

<div class="debug-game" data-state={currentState}>
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
						onclick={() => actor.send({ type: 'debugSetTeam', team })}
						type="button"
					>
						{team}
					</button>
				{/each}
			</div>
		</div>
		<Avatar user={playerData.find(x => x.id === debugUser)!} />
		<button onclick={() => actor.send({ type: 'start' })}>
			{snapshot.matches('start') ? 'Start' : 'Reset'}
		</button>
	</header>

	<div class="board">
		<div class="board-row">
			{#each teams as team}
				<div class="flex gap-2" class:flex-row-reverse={team === 'moon'}>
					{#each game.teams[team].players as userId}
						<Avatar
							user={playerData.find(x => x.id === userId)!}
							onclick={() => (debugUser = userId)}
							class={game.teams[team].spirit === userId ? 'underline' : ''}
						/>
					{/each}
				</div>
			{/each}
		</div>
		{#each range(board.turns) as turn}
			<div class="board-row">
				{#each teams as team}
					{@const entry = game.teams[team].board[turn]}
					<div class:flex-row-reverse={team === 'moon'}>
						{#if board[team].hints.includes(turn)}
							<Eye size={24} />
						{:else}
							<div style="width:24px; height:24px"></div>
						{/if}
						<span class:invalid={isBoardEntryInvalid(game, entry)} class:done={isBoardEntryDone(game, entry)}>
							{entry?.value || '\u00a0'}
						</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>

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
						<span class="vote-stack">
							{#each voteState.voted as userId (userId)}
								<span class="vote-ghost" transition:fly={{ y: 16, duration: 260 }}>
									<Avatar user={playerData.find(x => x.id === userId)!} name={false} />
								</span>
							{/each}
						</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if canSeeVote(currentState, 'pickQuestions')}
		{@const canPickQuestions = canVote(currentState, game, 'pickQuestions', debugUser)}
		<div class="question-selector" data-can-vote={canPickQuestions}>
			{#each currentTeam.questions as qId, questionIndex (qId)}
				{@const q = questions.find(x => x.id === qId)!}
				{@const voteState = optionVoteState(currentState, game, 'pickQuestions', questionIndex)}
				<button
					aria-pressed={voteState.voted.includes(debugUser)}
					class="question-card"
					data-voted={voteState.voted.includes(debugUser)}
					disabled={!canPickQuestions}
					onclick={() =>
						actor.send({
							type: 'vote',
							action: 'pickQuestions',
							option: questionIndex,
							userId: debugUser,
						})}
					type="button"
				>
					<span class="question-title">
						{#if canPickQuestions}
							{q.title}
						{:else}
							{@render runes(`${qId}:title`, { words: 2, min: 3, max: 8 })}
						{/if}
					</span>
					<span class="question-body">
						{#if canPickQuestions}
							{q.question}
						{:else}
							{@render runes(`${qId}:question`, { words: 5, min: 3, max: 9 })}
						{/if}
					</span>
					<span class="question-votes" aria-label={`Votes for ${q.title}`}>
						<span class="vote-stack">
							{#each voteState.voted as userId (userId)}
								<span class="vote-ghost" transition:fly={{ y: 16, duration: 260 }}>
									<Avatar user={playerData.find(x => x.id === userId)!} name={false} />
								</span>
							{/each}
						</span>
					</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if canSeeVote(currentState, 'mediumAction')}
		<div class="action-dock">
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
		</div>
	{/if}
</div>

<style>
	.debug-game {
		position: relative;
		display: grid;
		gap: 1rem;
		color: var(--app-text);
		padding-bottom: 4rem;
	}

	.board-row {
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--app-border);
		& > * {
			flex: 1 1 0;
			display: flex;
			align-items: center;
			padding: 0.25rem 0;
			gap: 0.5rem;
		}
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

	.action-dock {
		position: absolute;
		right: -1rem;
		bottom: -1rem;
		left: -1rem;
		z-index: 40;
		border-top: 1px solid var(--app-border);
		background: var(--app-panel);
		box-shadow: 0 -0.22rem 0.7rem color-mix(in srgb, black 14%, transparent);
		padding: 0.5rem 1rem;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		align-items: center;
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

	.debug-game[data-state='setupWord'] {
		min-height: 34rem;
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
		perspective: 58rem;
	}

	button.question-card {
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
		cursor: pointer;
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

	button.question-card::before {
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
	.question-body,
	.question-votes {
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
		padding: 0.7rem 0.85rem 0.62rem;
		text-align: center;
		text-shadow: 0 0.18rem 0.42rem color-mix(in oklab, black 34%, transparent);
		transform: translateZ(0.7rem);
	}

	button.question-card[data-voted='true'] .question-title {
		background: color-mix(in oklab, var(--app-focus) 14%, var(--app-input));
	}

	.question-body {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 7.15rem;
		flex: 1 1 auto;
		color: color-mix(in oklab, var(--app-text) 88%, var(--app-muted) 12%);
		font-size: 0.98rem;
		font-weight: 650;
		line-height: 1.28;
		padding: 0.85rem 0.95rem;
		text-align: center;
		text-wrap: balance;
		transform: translateZ(0.45rem);
	}

	.question-body .rune-word {
		font-size: 1.06rem;
		line-height: 1.28;
	}

	.question-votes {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 2.35rem;
		border-top: 1px solid color-mix(in oklab, var(--app-border) 64%, transparent);
		background: linear-gradient(180deg, color-mix(in oklab, var(--app-input) 24%, transparent), transparent);
		margin-top: auto;
		padding: 0.35rem 0.75rem 0.45rem;
		transform: translateZ(0.75rem);
	}

	.question-votes .vote-stack {
		justify-content: center;
		width: 100%;
		min-width: 0;
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

	@media (max-width: 460px) {
		.debug-game[data-state='setupWord'] {
			min-height: 31rem;
		}

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
