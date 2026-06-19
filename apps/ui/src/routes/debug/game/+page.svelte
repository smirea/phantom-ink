<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import { Eye } from '@lucide/svelte';
	import { board, questions, words, type QuestionCard, type WordCard } from '@repo/shared/data';
	import type { User } from '@repo/shared/onlineGame';
	import { range, sample, shuffle, uniq } from 'es-toolkit';
	import { onDestroy } from 'svelte';
	import { assign, createActor, setup } from 'xstate';

	type Team = 'sun' | 'moon';

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
	type VoteAction = 'ask' | 'eyeHint' | 'guess';
	type VoteState = { votes: User['id'][]; participating: User['id'][]; required: number };

	interface TeamState {
		spirit: User['id'];
		players: Array<User['id']>;
		questions: Array<QuestionCard['id']>;
		spiritQuestionPicks: Array<QuestionCard['id']>;
		spiritQuestionDiscards: Array<QuestionCard['id']>;
		eyeUsedRows: number[];
		board: BoardEntry[];
		voting: Record<VoteAction, VoteState>;
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
		| { type: 'vote'; action: VoteAction; playerId: User['id'] }
		| { type: 'debugSetState'; state: GameState; team: Team };

	const teams = ['sun', 'moon'] as const;
	const config = {
		questionsInHand: 7,
		questionsGivenToSpirit: 2,
	} as const;

	const gameMachine = setup({
		types: {
			context: {} as GameContext,
			events: {} as GameEvent,
		},
		actions: {
			setupGame: assign(() => createInitialContext()),
			pickWordCard: assign(({ context }) => ({ wordCard: sample(words), word: context.word })),
			setWord: assign(({ event }) => {
				if (event.type !== 'pickWord') return {};
				return { currentTeam: 'sun' as Team, word: sanitizePhrase(event.word) };
			}),
			drawQuestionHand: assign(({ context }) => drawQuestionHand(context)),
			pickQuestions: assign(({ context, event }) => {
				if (event.type !== 'pickQuestions') return {};
				const picked = event.questionIds.slice(0, config.questionsGivenToSpirit);
				return updateTeam(context, context.currentTeam, team => ({
					...team,
					questions: team.questions.filter(id => !picked.includes(id)),
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

				const clue = sanitizePhrase(event.clue);
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
			recordVote: assign(({ context, event }) => {
				if (event.type !== 'vote') return {};

				return updateTeam(context, context.currentTeam, team => {
					const current = team.voting[event.action];
					if (!current.participating.includes(event.playerId)) return team;

					const votes = current.votes.includes(event.playerId)
						? current.votes.filter(id => id !== event.playerId)
						: [...current.votes, event.playerId];

					return {
						...team,
						voting: {
							...team.voting,
							[event.action]: { ...current, votes },
						},
					};
				});
			}),
			resetVotes: assign(({ context }) => resetTeamVotes(context, context.currentTeam)),
			setupNextTurn: assign(({ context }) => ({
				currentTeam: otherTeam(context.currentTeam),
			})),
			debugSetTeam: assign(({ event }) => (event.type === 'debugSetState' ? { currentTeam: event.team } : {})),
		},
	}).createMachine({
		id: 'phantomInk',
		context: createInitialContext(),
		initial: 'start',
		on: {
			start: { target: '.setupWord', actions: 'setupGame' },
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
				entry: ['drawQuestionHand', 'resetVotes'],
				always: [
					{ guard: ({ context }) => hasConsensus(context, 'ask'), target: 'mediumsAsk', actions: 'resetVotes' },
					{
						guard: ({ context }) => hasConsensus(context, 'eyeHint') && hasEyeHint(context),
						target: 'eyeHint',
						actions: 'resetVotes',
					},
					{ guard: ({ context }) => hasConsensus(context, 'guess'), target: 'guessing', actions: 'resetVotes' },
				],
				on: {
					vote: { actions: 'recordVote' },
					eyeHint: { guard: ({ context }) => hasEyeHint(context), target: 'eyeHint', actions: 'resetVotes' },
					guess: { target: 'guessing', actions: 'resetVotes' },
					ask: { target: 'mediumsAsk', actions: 'resetVotes' },
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

	let game = $derived(snapshot.context);
	let currentState = $derived(
		gameStates.includes(snapshot.value as GameState) ? (snapshot.value as GameState) : 'start',
	);
	let currentTeam = $derived(game.currentTeam);
	let currentVoting = $derived(game.teams[currentTeam].voting);

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
			voting: createVoting(players),
		};
	}

	function createVoting(players: Array<User['id']>): Record<VoteAction, VoteState> {
		return {
			ask: createVoteState(players),
			eyeHint: createVoteState(players),
			guess: createVoteState(players),
		};
	}

	function createVoteState(players: Array<User['id']>): VoteState {
		return { votes: [], participating: [...players], required: players.length };
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

	function resetTeamVotes(context: GameContext, team: Team): GameContext {
		return updateTeam(context, team, current => ({ ...current, voting: createVoting(current.players) }));
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

	function hasConsensus(context: GameContext, action: VoteAction): boolean {
		const vote = context.teams[context.currentTeam].voting[action];
		return vote.required > 0 && vote.votes.length >= vote.required;
	}

	function vote(action: VoteAction) {
		actor.send({ type: 'vote', action, playerId: debugUser });
	}

	function canVote(action: VoteAction): boolean {
		if (currentState !== 'mediumsTurn') return false;
		if (action === 'eyeHint' && !hasEyeHint(game)) return false;
		return currentVoting[action].participating.includes(debugUser);
	}

	function votingUsers(voting: VoteState): { voted: User[]; missing?: User[] } {
		const voted = playerData.filter(user => voting.votes.includes(user.id));
		const missing = playerData.filter(
			user => voting.participating.includes(user.id) && !voting.votes.includes(user.id),
		);
		return missing.length ? { voted, missing } : { voted };
	}

	function otherTeam(team: Team): Team {
		return team === 'sun' ? 'moon' : 'sun';
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

	let debugUser = $state<User['id']>(sample(playerData).id!);
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
						state: (event.currentTarget as HTMLSelectElement).value as GameState,
						team: currentTeam,
					})}
			>
				{#each gameStates as state}
					<option value={state}>{state}</option>
				{/each}
			</select>

			<div class="team-toggle" aria-label="Active team">
				{#each teams as team}
					<button
						class:active-toggle={team === currentTeam}
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
					{#each game.teams[team].players as playerId}
						<Avatar
							user={playerData.find(x => x.id === playerId)!}
							onclick={() => (debugUser = playerId)}
							class={game.teams[team].spirit === playerId ? 'underline' : ''}
						/>
					{/each}
				</div>
			{/each}
		</div>
		{#each range(board.turns) as turn}
			<div class="board-row revere">
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

	<div class="action-dock">
		<div class="action-buttons">
			<InkButton
				size="lg"
				primary
				class="flex-1"
				disabled={!canVote('ask')}
				onclick={() => vote('ask')}
				voteLabel="Ask"
				voting={votingUsers(currentVoting.ask)}
			>
				Ask
			</InkButton>
			<InkButton
				size="lg"
				primary
				class="flex-1"
				disabled={!canVote('eyeHint')}
				onclick={() => vote('eyeHint')}
				voteLabel="Hint"
				voting={votingUsers(currentVoting.eyeHint)}
			>
				Hint
			</InkButton>
			<InkButton
				size="lg"
				primary
				class="flex-1"
				disabled={!canVote('guess')}
				onclick={() => vote('guess')}
				voteLabel="Guess"
				voting={votingUsers(currentVoting.guess)}
			>
				Guess
			</InkButton>
		</div>
	</div>
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
