<script lang="ts">
	import { board, questions, words, type QuestionCard, type WordCard } from '@repo/shared/data';
	import type { User } from '@repo/shared/onlineGame';
	import { range, sample, shuffle, uniq } from 'es-toolkit';
	import { onDestroy } from 'svelte';
	import { assign, createActor, setup } from 'xstate';

	type Team = 'sun' | 'moon';
	type ViewMode = 'act' | 'watch' | 'wait';
	type RelativeActor = 'currentSpirit' | 'otherSpirit' | 'currentMediums' | 'otherMediums';

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
		spirit: User['id'];
		players: Array<User['id']>;
		questions: Array<QuestionCard['id']>;
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
		| { type: 'debugSetState'; state: GameState; team: Team };

	const teams = ['sun', 'moon'] as const;
	const actors = ['sunSpirit', 'moonSpirit', 'sunMediums', 'moonMediums'] as const;
	const actorLabels: Record<ActorKey, string> = {
		sunSpirit: 'sun spirit',
		moonSpirit: 'moon spirit',
		sunMediums: 'sun mediums',
		moonMediums: 'moon mediums',
	};
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
			setupNextTurn: assign(({ context }) => ({
				currentTeam: context.debugHold ? context.currentTeam : otherTeam(context.currentTeam),
			})),
			debugSetStateContext: assign(({ context, event }) => {
				if (event.type !== 'debugSetState') return {};
				return createDebugContext(event.state, event.team || context.currentTeam);
			}),
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
				actions: 'debugSetStateContext',
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
							!context.debugHold &&
							(context.teams.sun.board.length < board.turns || context.teams.moon.board.length < board.turns),
						target: 'mediumsTurn',
					},
					{ guard: ({ context }) => !context.debugHold, target: 'lose' },
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

	let game = $derived(snapshot.context);
	let currentState = $derived(
		gameStates.includes(snapshot.value as GameState) ? (snapshot.value as GameState) : 'start',
	);
	let currentTeam = $derived(game.currentTeam);
	let currentTeamState = $derived(game.teams[currentTeam]);
	let currentQuestions = $derived(
		currentTeamState.questions.map(id => questionById.get(id)).filter(question => question !== undefined),
	);
	let spiritQuestions = $derived(
		currentTeamState.spiritQuestionPicks.map(id => questionById.get(id)).filter(question => question !== undefined),
	);
	let revealableClues = $derived(getRevealableClues(game));
	let currentClue = $derived(getCurrentClue(game));
	let currentGuess = $derived(getCurrentGuess(game));
	let canUseEye = $derived(hasEyeHint(game));
	let canTakeTurn = $derived(currentTeamState.board.length < board.turns);
	let activeView = $derived(actorView(currentState, activeActor, currentTeam));

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
		};
	}

	function createTeamState(players: Array<User['id']>): TeamState {
		return {
			spirit: pickOne(players),
			players,
			questions: [],
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
			const word = context.wordCard.words[0];
			if (!word) throw new Error('Missing word card word');
			context = { ...context, word: sanitizePhrase(word) };
		}

		if (state === 'mediumsTurn' || state === 'mediumsAsk') {
			context = drawQuestionHand(context);
		}

		if (state === 'eyeHint') {
			context = seedBoardLength(seedHint(context, otherTeam(team), 'ASH'), team, board[team].hints[0] ?? 0);
		}

		if (state === 'spiritAnswers') {
			context = updateTeam(drawQuestionHand(context), team, current => ({
				...current,
				spiritQuestionPicks: [questionIdAt(0), questionIdAt(1)],
			}));
		}

		if (state === 'mediumsGetClues') {
			context = seedHint(context, team, 'DOG');
		}

		if (state === 'win') {
			context = updateTeam(context, team, current => ({
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

		if (state === 'lose') {
			context = teams.reduce((next, team) => seedBoardLength(next, team, board.turns), context);
		}

		return context;

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

	function otherTeam(team: Team): Team {
		return team === 'sun' ? 'moon' : 'sun';
	}

	function actorView(state: GameState, actor: ActorKey, team: Team): ViewMode {
		const isSpirit = actor.endsWith('Spirit');
		const isCurrent = actor.startsWith(team);
		const role: RelativeActor = isSpirit
			? isCurrent
				? 'currentSpirit'
				: 'otherSpirit'
			: isCurrent
				? 'currentMediums'
				: 'otherMediums';
		return roleRows.find(row => row.state === state)?.[role] ?? 'wait';
	}

	function waitMessage(state: GameState): string {
		if (state === 'win') return `${currentTeam} wins`;
		if (state === 'lose') return 'both teams lose';
		return 'wait';
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

	function submitGuessLetter(): void {
		if (!guessLetter.trim()) return;
		actor.send({ type: 'guessLetter', letter: guessLetter });
		guessLetter = '';
	}
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
		<button onclick={() => actor.send({ type: 'start' })}>{snapshot.matches('start') ? 'Start' : 'Reset'}</button>
	</header>

	<nav class="actor-tabs" aria-label="Actor views">
		{#each actors as actorKey}
			<button class:active-tab={actorKey === activeActor} onclick={() => (activeActor = actorKey)} type="button">
				{actorLabels[actorKey]} ({actorView(currentState, actorKey, currentTeam)})
			</button>
		{/each}
	</nav>

	<section class="actor-view">
		{#if activeView === 'act'}
			{#if snapshot.matches('setupWord')}
				<p class="muted-line">{game.wordCard.words.join(' / ')}</p>
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
							<input
								type="checkbox"
								checked={pickedQuestionIds.includes(q.id)}
								onchange={() => {
									if (pickedQuestionIds.includes(q.id)) {
										pickedQuestionIds = pickedQuestionIds.filter(questionId => questionId !== q.id);
									} else {
										pickedQuestionIds =
											pickedQuestionIds.length >= config.questionsGivenToSpirit
												? [pickedQuestionIds[1], q.id]
												: [...pickedQuestionIds, q.id];
									}
								}}
							/>
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
			{/if}
		{:else if activeView === 'watch'}
			<p class="placeholder-snippet">watch</p>
		{:else}
			<p>{waitMessage(currentState)}</p>
		{/if}
	</section>

	<div class="action-dock">
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
					<button
						disabled={pickedQuestionIds.length !== config.questionsGivenToSpirit}
						onclick={() => {
							const [first, second] = pickedQuestionIds;
							if (!first || !second) return;
							actor.send({ type: 'pickQuestions', questionIds: [first, second] });
							pickedQuestionIds = [];
						}}
					>
						Give to Spirit
					</button>
				{:else if snapshot.matches('spiritAnswers')}
					<button
						disabled={!clueText.trim()}
						onclick={() => {
							const questionId = answerQuestionId || currentTeamState.spiritQuestionPicks[0];
							if (!questionId || !clueText.trim()) return;
							actor.send({ type: 'answer', questionId, clue: clueText });
							answerQuestionId = '';
							clueText = '';
						}}
					>
						Submit Clue
					</button>
				{:else if snapshot.matches('mediumsGetClues')}
					<button onclick={() => actor.send({ type: 'getClue' })}>Get Letter</button>
					<button onclick={() => actor.send({ type: 'silencio' })}>Silencio</button>
				{:else if snapshot.matches('guessing')}
					<button disabled={!guessLetter.trim()} onclick={submitGuessLetter}>Submit Letter</button>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.debug-game {
		position: relative;
		display: grid;
		gap: 1rem;
		color: var(--app-text);
	}

	button,
	input,
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

	p {
		margin: 0;
	}

	small {
		color: var(--app-muted);
		font-size: 0.8rem;
	}

	.muted-line {
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

	.actor-view {
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

	.action-dock {
		position: sticky;
		bottom: 0;
		z-index: 40;
		margin-top: 1rem;
		border-top: 1px solid var(--app-border);
		background: var(--app-panel);
		box-shadow: 0 -0.22rem 0.7rem color-mix(in srgb, black 14%, transparent);
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

	@media (max-width: 640px) {
		.action-buttons {
			justify-content: flex-start;
		}
	}
</style>
