<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import { Eye } from '@lucide/svelte';
	import { board, questions, words, type QuestionCard, type WordCard } from '@repo/shared/data';
	import type { UserRecord } from '@repo/shared/onlineGame';
	import { range, sample, shuffle, uniq } from 'es-toolkit';
	import { onDestroy } from 'svelte';
	import { assign, createActor, setup } from 'xstate';

	type Team = 'sun' | 'moon';

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
		| { type: 'getClue' };

	const teams = ['sun', 'moon'] as const;
	const turns = range(board.turns);
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
				currentTeam: context.currentTeam === 'sun' ? 'moon' : 'sun',
			})),
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
		},
	}).createMachine({
		id: 'phantomInk',
		context: createInitialContext(),
		initial: 'start',
		on: {
			start: { target: '.setupWord', actions: 'setupGame' },
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
				always: [{ guard: 'gameNotOver', target: 'mediumsTurn' }, { target: 'lose' }],
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

	let game = $derived(snapshot.context);
	let currentTeam = $derived(game.currentTeam);
	let currentTeamState = $derived(game.teams[currentTeam]);
	let currentQuestions = $derived(currentTeamState.questions.map(question).filter(isQuestion));
	let spiritQuestions = $derived(currentTeamState.spiritQuestionPicks.map(question).filter(isQuestion));
	let revealableClues = $derived(getRevealableClues(game));
	let currentClue = $derived(getCurrentClue(game));
	let currentGuess = $derived(getCurrentGuess(game));
	let canUseEye = $derived(hasEyeHint(game));
	let canTakeTurn = $derived(currentTeamState.board.length < board.turns);

	function createInitialContext(): GameContext {
		return {
			currentTeam: 'sun',
			wordCard: pickOne(words),
			word: '',
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

	function pickOne<T>(items: readonly T[]): T {
		const item = sample(items);
		if (item === undefined) throw new Error('Cannot pick from an empty list');
		return item;
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
		<div>
			<div class="eyebrow">state: {String(snapshot.value)}</div>
			<h1>Phantom Ink Debug</h1>
		</div>
		<button onclick={() => actor.send({ type: 'start' })}>{snapshot.matches('start') ? 'Start' : 'Reset'}</button>
	</header>

	<section class="status">
		<div><strong>Object:</strong> {game.word || 'not picked'}</div>
		<div><strong>Turn:</strong> {currentTeam}</div>
		<div><strong>Row:</strong> {Math.min(currentTeamState.board.length + 1, board.turns)}</div>
	</section>

	<section class="board">
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

	<section class="panel">
		{#if snapshot.matches('start')}
			<p>Start a fresh scratch game.</p>
			<button onclick={() => actor.send({ type: 'start' })}>Start</button>
		{:else if snapshot.matches('setupWord')}
			<h2>Pick Object</h2>
			<div class="word-card">
				{#each game.wordCard.words as word}
					<button onclick={() => actor.send({ type: 'pickWord', word })}>{word}</button>
				{/each}
			</div>
		{:else if snapshot.matches('mediumsTurn')}
			<h2>{currentTeam} Medium</h2>
			<div class="actions">
				<button disabled={!canUseEye} onclick={() => actor.send({ type: 'eyeHint' })}>Use Eye</button>
				<button disabled={!canTakeTurn} onclick={() => actor.send({ type: 'ask' })}>Ask</button>
				<button disabled={!canTakeTurn} onclick={() => actor.send({ type: 'guess' })}>Guess</button>
			</div>
		{:else if snapshot.matches('eyeHint')}
			<h2>Pick Eye Clue</h2>
			<div class="list">
				{#each revealableClues as clue}
					<button onclick={() => actor.send({ type: 'pickHint', clueId: clue.id })}>
						{clue.team}: {clue.value || 'blank'} ({clue.revealed ?? 0}/{clue.fullValue?.length ?? 0})
					</button>
				{/each}
			</div>
		{:else if snapshot.matches('mediumsAsk')}
			<h2>Pick Two Questions</h2>
			<div class="question-grid">
				{#each currentQuestions as q}
					<label class:chosen={pickedQuestionIds.includes(q.id)}>
						<input type="checkbox" checked={pickedQuestionIds.includes(q.id)} onchange={() => toggleQuestion(q.id)} />
						<span>{q.title}</span>
						<small>{q.question}</small>
					</label>
				{/each}
			</div>
			<button disabled={pickedQuestionIds.length !== config.questionsGivenToSpirit} onclick={submitQuestions}>
				Give to Spirit
			</button>
		{:else if snapshot.matches('spiritAnswers')}
			<h2>Spirit Answers</h2>
			<select bind:value={answerQuestionId}>
				<option value="">Choose question</option>
				{#each spiritQuestions as q}
					<option value={q.id}>{q.title}: {q.question}</option>
				{/each}
			</select>
			<input bind:value={clueText} placeholder="Full clue" />
			<button disabled={!clueText.trim()} onclick={submitAnswer}>Submit Clue</button>
		{:else if snapshot.matches('mediumsGetClues')}
			<h2>Reveal Clue</h2>
			<p class="mono">
				{currentClue?.value || 'blank'} ({currentClue?.revealed ?? 0}/{currentClue?.fullValue?.length ?? 0})
			</p>
			<div class="actions">
				<button onclick={() => actor.send({ type: 'getClue' })}>Get Letter</button>
				<button onclick={() => actor.send({ type: 'silencio' })}>Silencio</button>
			</div>
		{:else if snapshot.matches('guessing')}
			<h2>Guess Object</h2>
			<p class="mono">{currentGuess?.value || 'blank'}</p>
			<input
				bind:value={guessLetter}
				maxlength="1"
				placeholder="Letter"
				onkeydown={event => event.key === 'Enter' && submitGuessLetter()}
			/>
			<button disabled={!guessLetter.trim()} onclick={submitGuessLetter}>Submit Letter</button>
		{:else if snapshot.matches('win')}
			<h2>{currentTeam} wins</h2>
			<p>Object: {game.word}</p>
		{:else if snapshot.matches('lose')}
			<h2>Both teams lose</h2>
			<p>Object: {game.word}</p>
		{/if}
	</section>
</div>

<style>
	.debug-game {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		color: var(--app-text);
	}

	button,
	input,
	select {
		border: 1px solid var(--app-border);
		border-radius: 4px;
		padding: 0.45rem 0.6rem;
		background: var(--app-input);
		color: inherit;
	}

	button:disabled {
		opacity: 0.45;
	}

	.top-bar,
	.status,
	.actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.top-bar {
		justify-content: space-between;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	.eyebrow,
	small {
		color: var(--app-muted);
		font-size: 0.8rem;
	}

	.board,
	.panel {
		border: 1px solid var(--app-border);
		border-radius: 6px;
		background: var(--app-panel);
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

	.panel {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
	}

	.word-card,
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
		border: 1px solid var(--app-border);
		border-radius: 4px;
		padding: 0.5rem;
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
</style>
