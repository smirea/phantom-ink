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
		id: string;
		type: 'guess' | 'hint';
		value: string;
		fullValue?: string;
		revealed?: number;
		done?: boolean;
		invalid?: boolean;
		questionId?: QuestionCard['id'];
	};
	type VoteState = { voted: User['id'][]; eligible: User[]; required: number };
	type VoteOption = number | string;

	interface TeamState {
		spirit: User['id'];
		players: Array<User['id']>;
		questions: Array<QuestionCard['id']>;
		spiritQuestionPicks: Array<QuestionCard['id']>;
		spiritQuestionDiscards: Array<QuestionCard['id']>;
		eyeUsedRows: number[];
		board: BoardEntry[];
		voting: Partial<Record<VoteType, Partial<Record<User['id'], VoteOption[]>>>>;
	}

	interface GameContext {
		currentTeam: Team;
		wordCard: WordCard;
		word: string;
		discardedQuestionsDeck: Array<QuestionCard['id']>;
		teams: Record<Team, TeamState>;
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
		| { type: 'debugSetState'; state: GameState; team: Team };

	const teams = ['sun', 'moon'] as const;
	const config = {
		questionsInHand: 7,
		questionsGivenToSpirit: 2,
		alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
	} as const;

	type VoteType = 'pickWord' | 'mediumAction' | 'pickQuestions' | 'clue' | 'guessLetter' | 'pickHint';

	const votingConfig = {
		pickWord: {
			activeState: 'setupWord',
			mode: 'anySpirit',
			count: 1,
			choices: (ctx: GameContext) => range(ctx.wordCard.words.length),
		},
		mediumAction: {
			activeState: 'mediumsTurn',
			mode: 'activeMedium',
			count: 1,
			choices: (ctx: GameContext) => (hasEyeHint(ctx) ? ['ask', 'eyeHint', 'guess'] : ['ask', 'guess']),
		},
		pickQuestions: {
			activeState: 'mediumsAsk',
			mode: 'activeMedium',
			count: config.questionsGivenToSpirit,
			choices: (ctx: GameContext) => range(ctx.teams[ctx.currentTeam].questions.length),
		},
		clue: {
			activeState: 'mediumsGetClues',
			mode: 'activeMedium',
			count: 1,
			choices: () => ['getClue', 'silencio'],
		},
		guessLetter: {
			activeState: 'guessing',
			mode: 'activeMedium',
			count: 1,
			choices: () => config.alphabet,
		},
		pickHint: {
			activeState: 'eyeHint',
			mode: 'activeMedium',
			count: 1,
			choices: (ctx: GameContext) => getRevealableClues(ctx).map(clue => clue.id),
		},
	} satisfies Record<
		VoteType,
		{
			activeState: GameState;
			mode: 'anySpirit' | 'activeMedium';
			count: number;
			choices: (ctx: GameContext) => VoteOption[];
		}
	>;

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
			pickWordCard: assign(() => ({ wordCard: sample(words) })),
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
					team.spiritQuestionDiscards = [];
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
						id: `${teamKey}-${team.board.length}`,
						type: 'hint',
						value: '',
						fullValue: sanitizePhrase(event.clue),
						revealed: 0,
						questionId,
					});
					team.spiritQuestionDiscards = team.spiritQuestionPicks.filter(id => id !== questionId);
					draft.discardedQuestionsDeck = uniq([...draft.discardedQuestionsDeck, ...team.spiritQuestionPicks]);
					team.spiritQuestionPicks = [];
				});
			}),
			giveEyeHint: assign(({ context, event }) => {
				if (event.type !== 'pickHint') return {};
				const row = context.teams[context.currentTeam].board.length;
				const revealed = revealClue(context, event.clueId);
				return produce(revealed, draft => {
					const team = draft.teams[draft.currentTeam];
					team.eyeUsedRows = uniq([...team.eyeUsedRows, row]);
				});
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
				return produce(context, draft => {
					draft.teams[teamKey].board.push(entry);
				});
			}),
			recordCorrectGuessLetter: assign(({ context, event }) => {
				if (event.type !== 'guessLetter') return {};
				return updateLastGuess(context, event.letter);
			}),
			recordIncorrectGuessLetter: assign(({ context, event }) => {
				if (event.type !== 'guessLetter') return {};
				return updateLastGuess(context, event.letter, true);
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
						delete draft.teams[draft.currentTeam].voting[event.action];
					});
				});
				if (nextEvent) enqueue.raise(nextEvent);
			}),
			setupNextTurn: assign(({ context }) => ({
				currentTeam: context.currentTeam === 'sun' ? 'moon' : 'sun',
			})),
			debugSetTeam: assign(({ event }) => (event.type === 'debugSetState' ? { currentTeam: event.team } : {})),
		},
	}).createMachine({
		id: 'phantomInk',
		context: createInitialContext(),
		initial: 'start',
		on: {
			start: { target: '.setupWord', actions: 'setupGame' },
			vote: { actions: 'recordVote' },
			debugSetState: gameStates.map(state => ({
				guard: ({ event }) => event.type === 'debugSetState' && event.state === state,
				target: `.${state}`,
				actions: 'debugSetTeam',
			})),
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
							actions: 'recordCorrectGuessLetter',
						},
						{
							guard: ({ context, event }) => event.type === 'guessLetter' && !nextGuess(context, event.letter).valid,
							target: 'nextTurn',
							actions: 'recordIncorrectGuessLetter',
						},
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
				always: {
					guard: ({ context }) => {
						const clue = getCurrentClue(context);
						return !clue || clue.done === true;
					},
					target: 'nextTurn',
				},
				on: {
					getClue: {
						guard: ({ context }) => {
							const clue = getCurrentClue(context);
							return Boolean(clue && clue.done !== true);
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
			wordCard: sample(words),
			word: '',
			discardedQuestionsDeck: [],
			teams: {
				sun: createTeamState([0, 1, 2]),
				moon: createTeamState([3, 4, 5]),
			},
		};
	}

	function createTeamState(players: Array<User['id']>): TeamState {
		return {
			spirit: sample(players),
			players,
			questions: [],
			spiritQuestionPicks: [],
			spiritQuestionDiscards: [],
			eyeUsedRows: [],
			board: [],
			voting: {},
		};
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
			const voting = draft.teams[draft.currentTeam].voting;
			const votes = (voting[v] ??= {}) as Partial<Record<User['id'], VoteOption[]>>;
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
				delete voting[v];
			}
		});
	}

	function revealClue(context: GameContext, clueId: string): GameContext {
		return produce(context, draft => {
			for (const teamKey of teams) {
				const entry = draft.teams[teamKey].board.find(entry => entry.id === clueId);
				if (!entry || entry.type !== 'hint') continue;

				const fullValue = entry.fullValue ?? '';
				const currentRevealed = entry.revealed ?? 0;
				const revealed = Math.min(currentRevealed + 1, fullValue.length);
				const value = currentRevealed >= fullValue.length ? `${fullValue}.` : fullValue.slice(0, revealed);
				entry.revealed = revealed;
				entry.value = value;
				entry.done = value.endsWith('.');
				return;
			}
		});
	}

	function updateLastGuess(context: GameContext, letter: string, invalid = false): GameContext {
		const nextLetter = sanitizeGuessLetter(letter);
		if (!nextLetter) return context;

		return produce(context, draft => {
			const entry = draft.teams[draft.currentTeam].board.at(-1);
			if (!entry || entry.type !== 'guess') return;

			const value = `${entry.value}${nextLetter}`;
			entry.value = value;
			entry.done = !invalid && value === draft.word;
			entry.invalid = invalid;
		});
	}

	function nextGuess(context: GameContext, letter: string): { value: string; valid: boolean } {
		const entry = context.teams[context.currentTeam].board.at(-1);
		const value = `${entry?.type === 'guess' ? entry.value : ''}${sanitizeGuessLetter(letter)}`;
		return { value, valid: Boolean(value) && context.word.startsWith(value) };
	}

	function getCurrentClue(context: GameContext): BoardEntry | null {
		const entry = context.teams[context.currentTeam].board.at(-1);
		return entry?.type === 'hint' ? entry : null;
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

	function consensusEvent(state: GameState, context: GameContext, action: VoteType): GameEvent | null {
		const options = consensusOptions(state, context, action);
		if (options.length !== votingConfig[action].count) return null;

		const team = context.teams[context.currentTeam];
		const [option] = options;
		switch (action) {
			case 'pickWord':
				return typeof option === 'number' ? { type: 'pickWord', word: context.wordCard.words[option] } : null;
			case 'mediumAction':
				return option === 'ask' || option === 'guess' || option === 'eyeHint' ? { type: option } : null;
			case 'pickQuestions': {
				const questionIds = options
					.filter((value): value is number => typeof value === 'number')
					.map(index => team.questions[index])
					.filter((id): id is QuestionCard['id'] => Boolean(id));
				const [first, second] = questionIds;
				return first !== undefined && second !== undefined
					? { type: 'pickQuestions', questionIds: [first, second] }
					: null;
			}
			case 'clue':
				return option === 'getClue' || option === 'silencio' ? { type: option } : null;
			case 'guessLetter':
				return typeof option === 'string' ? { type: 'guessLetter', letter: option } : null;
			case 'pickHint':
				return typeof option === 'string' ? { type: 'pickHint', clueId: option } : null;
		}
	}

	function optionVoteState(s: GameState, context: GameContext, action: VoteType, option: VoteOption): VoteState {
		const selected = context.teams[context.currentTeam].voting[action] ?? {};
		const eligible = playerData.filter(user => canVote(s, context, action, user.id));
		const voted = eligible.filter(user => selected[user.id]?.includes(option)).map(user => user.id);
		return { voted, eligible, required: eligible.length };
	}

	function consensusOptions(s: GameState, context: GameContext, action: VoteType): VoteOption[] {
		const voteConfig = votingConfig[action];
		const eligible = playerData.filter(user => canVote(s, context, action, user.id));
		if (!eligible.length) return [];

		const selected = context.teams[context.currentTeam].voting[action] ?? {};
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
		state: 'mediumsTurn',
		team: 'sun',
	});
</script>

<div class="debug-game">
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
						onclick={() => actor.send({ type: 'debugSetState', state: currentState, team })}
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
						<span class:invalid={entry?.invalid} class:done={entry?.done}>
							{entry?.value || '\u00a0'}
						</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>

	{#if canSeeVote(currentState, 'mediumAction')}
		<div class="action-dock">
			<div class="action-buttons">
				{#each votingConfig.mediumAction.choices(game) as option}
					<InkButton
						size="lg"
						primary
						class="flex-1"
						disabled={!canVote(currentState, game, 'mediumAction', debugUser)}
						onclick={() => actor.send({ type: 'vote', action: 'mediumAction', option, userId: debugUser })}
						voteLabel={voteLabel(option)}
						voting={optionVoteState(currentState, game, 'mediumAction', option)}
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
</style>
