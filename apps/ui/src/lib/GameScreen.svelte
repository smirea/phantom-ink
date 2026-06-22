<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import GameCard from '$lib/GameCard.svelte';
	import GameRunes from '$lib/GameRunes.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import { playerColorPreset } from '$lib/playerPresentation';
	import { Check, Eye, Info, Maximize2, Minimize2, Moon, Sun, X } from '@lucide/svelte';
	import { board, questions, type QuestionCard } from '@repo/shared/data';
	import {
		boardEntryId,
		canAnswerSpirit,
		canSeeVote,
		canVote,
		gameConfig as config,
		getCurrentClue,
		isBoardEntryDone,
		optionVoteState as createOptionVoteState,
		playerTeam,
		teams,
		voteLabel,
		votingConfig,
		wordCard,
		type BoardEntry,
		type GameEvent,
		type GameContext,
		type GameState,
		type KnownQuestion,
		type VoteOption,
		type VoteState,
		type VoteType,
	} from '@repo/shared/game';
	import type { User } from '@repo/shared/onlineGame';
	import type { Team } from '@repo/shared/types';
	import { range } from 'es-toolkit';
	import { crossfade, fade, fly, slide } from 'svelte/transition';

	type Props = {
		game: GameContext;
		state: GameState;
		players: User[];
		viewerId: User['id'];
		send: (event: GameEvent) => void;
		onSelectViewer?: (userId: User['id']) => void;
		showDebugPlayerPicker?: boolean;
		showStartPanel?: boolean;
	};

	let {
		game,
		state: currentState,
		players,
		viewerId,
		send,
		onSelectViewer,
		showDebugPlayerPicker = false,
		showStartPanel = false,
	}: Props = $props();

	const [sendQuestionCard, receiveQuestionCard] = crossfade({
		duration: 220,
		fallback: node => fade(node, { duration: 160 }),
	});

	let questionsMinimized = $state(false);

	function optionVoteState(s: GameState, context: GameContext, action: VoteType, option: VoteOption): VoteState {
		return createOptionVoteState(s, context, action, option, players);
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
		if (!rowHasKnownQuestions(context, viewerId, turn)) {
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

	function answerClue(questionId: QuestionCard['id']) {
		const clue = clueDrafts[questionId]?.trim();
		if (!clue) return;

		send({ type: 'answer', questionId, clue });
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

	function player(userId: User['id']): User {
		return players.find(user => user.id === userId)!;
	}

	function playerColor(userId: User['id']): string {
		return playerColorPreset(player(userId).color).value;
	}

	function activeVoteForState(state: GameState): VoteType | null {
		switch (state) {
			case 'setupWord':
				return 'pickWord';
			case 'mediumsTurn':
				return 'mediumAction';
			case 'eyeHint':
				return 'pickHint';
			case 'mediumsAsk':
				return 'pickQuestions';
			case 'mediumsGetClues':
				return 'clue';
			case 'guessing':
				return 'guessLetter';
			default:
				return null;
		}
	}

	function playerIsActive(userId: User['id']): boolean {
		const activeVote = activeVoteForState(currentState);
		if (activeVote) return canVote(currentState, game, activeVote, userId);
		if (currentState === 'spiritAnswers') return canAnswerSpirit(game, userId);
		return true;
	}

	function teamHasActivePlayer(team: Team): boolean {
		return game.teams[team].players.some(playerIsActive);
	}

	let clueDrafts = $state<Record<string, string>>({});
	let answerQuestionId = $state<QuestionCard['id'] | null>(null);
	let expandedBoardRows = $state<number[]>([]);

	const currentTeam = $derived(game.teams[game.currentTeam]);
	const hasQuestionFooterContent = $derived(
		canVote(currentState, game, 'pickQuestions', viewerId) ||
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
		if (currentState !== 'mediumsAsk' && currentState !== 'spiritAnswers') questionsMinimized = false;
	});
</script>

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
			<span class="vote-dot" style:--vote-color={playerColor(userId)} transition:fly={{ y: 8, duration: 220 }}></span>
		{/each}
	</span>
{/snippet}

{#snippet QuestionChoice(q: QuestionCard, questionIndex: number, canPickQuestions: boolean, compact: boolean)}
	{@const voteState = optionVoteState(currentState, game, 'pickQuestions', questionIndex)}
	<GameCard
		interactive
		title={q.title}
		bodyText={q.question}
		redacted={!canPickQuestions}
		redactionKey={q.id}
		titleRune={{ words: 1, min: 4, max: 16 }}
		bodyRune={{ words: 5, min: 3, max: 9 }}
		{compact}
		fillHeight={!compact}
		titleAddonVisible={Boolean(voteState.voted.length)}
		voted={voteState.voted.includes(viewerId)}
		disabled={!canPickQuestions}
		receiveTransition={receiveQuestionCard}
		sendTransition={sendQuestionCard}
		transitionKey={q.id}
		onclick={() =>
			send({
				type: 'vote',
				action: 'pickQuestions',
				option: questionIndex,
				userId: viewerId,
			})}
		type="button"
	>
		{#snippet titleAddon()}
			{@render VoteStack(voteState)}
		{/snippet}
	</GameCard>
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

{#snippet TeamPlayer(team: Team, userId: User['id'])}
	{@const isSpirit = game.teams[team].spirit === userId}
	{@const isActive = playerIsActive(userId)}
	{@const isViewer = viewerId === userId}
	{#if showDebugPlayerPicker}
		<button
			class="team-player"
			data-active={isActive ? 'true' : 'false'}
			data-spirit={isSpirit ? 'true' : undefined}
			data-viewer={isViewer ? 'true' : undefined}
			onclick={() => onSelectViewer?.(userId)}
			type="button"
		>
			<Avatar user={player(userId)} name={false} />
			<span class="team-player-name">{player(userId).name}</span>
		</button>
	{:else}
		<span class="team-player" data-active={isActive ? 'true' : 'false'} data-spirit={isSpirit ? 'true' : undefined}>
			<Avatar user={player(userId)} name={false} />
			<span class="team-player-name">{player(userId).name}</span>
		</span>
	{/if}
{/snippet}

{#snippet TeamPresence()}
	<div class="team-presence">
		{#each teams as team}
			<div class="team-presence-side" data-team={team} data-active={teamHasActivePlayer(team) ? 'true' : undefined}>
				<div class="team-mark">
					{#if team === 'sun'}
						<Sun size={82} strokeWidth={1.35} />
					{:else}
						<Moon size={82} strokeWidth={1.35} />
					{/if}
				</div>
				<div class="team-player-list">
					{#each game.teams[team].players as userId (userId)}
						{@render TeamPlayer(team, userId)}
					{/each}
				</div>
			</div>
			{#if team === 'sun'}
				<div class="team-presence-gap"></div>
			{/if}
		{/each}
	</div>
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
	class="game-screen"
	data-action-footer={actionFooterKind}
	data-questions-minimized={(currentState === 'mediumsAsk' || currentState === 'spiritAnswers') && questionsMinimized
		? 'true'
		: undefined}
	data-state={currentState}
	data-has-actions={hasActionFooter}
>
	<div class="game-content">
		{@render TeamPresence()}

		<div class="board">
			{#each range(board.turns) as turn}
				{@const hasKnownQuestions = rowHasKnownQuestions(game, viewerId, turn)}
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
								{@const canUseHintCell = canVote(currentState, game, 'pickHint', viewerId)}
								<button
									class="board-cell"
									class:flex-row-reverse={team === 'moon'}
									data-hint-target={canUseHintCell && !hasUserVote(game, 'pickHint', viewerId) ? 'true' : undefined}
									data-guess-target={isGuessingCell ? 'true' : undefined}
									data-voted={voteState.voted.includes(viewerId)}
									disabled={!canUseHintCell}
									onclick={() => send({ type: 'vote', action: 'pickHint', option: clueId, userId: viewerId })}
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
									{#each knownQuestionsForCell(game, viewerId, questionTeam, turn) as known (`${questionTeam}:${known.kind}:${known.question.id}`)}
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

		{#if showStartPanel && currentState === 'start'}
			<div class="state-panel start-panel">
				<div class="panel-runes"><GameRunes hash="start" words={4} min={3} max={8} size="panel" /></div>
				<InkButton size="lg" primary onclick={() => send({ type: 'start' })}>Start</InkButton>
			</div>
		{/if}

		{#if canSeeVote(currentState, 'pickQuestions')}
			{@const canPickQuestions = canVote(currentState, game, 'pickQuestions', viewerId)}
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

		{#if currentState === 'spiritAnswers'}
			{@const canAnswer = canAnswerSpirit(game, viewerId)}
			{@const selectedQuestionId = selectedAnswerQuestionId(game)}
			{#if !questionsMinimized}
				<div class="answer-question-overlay" transition:fly={{ y: 20, duration: 180 }}>
					<div class="answer-question-stage" data-can-answer={canAnswer}>
						{#each currentTeam.spiritQuestionPicks as qId, questionIndex (qId)}
							{@const q = questions.find(x => x.id === qId)!}
							<GameCard
								interactive
								variant="answer"
								title={q.title}
								bodyText={q.question}
								redacted={!canAnswer}
								redactionKey={`${q.id}:answer`}
								titleRune={{ words: 1, min: 4, max: 16 }}
								bodyRune={{ words: 5, min: 4, max: 10 }}
								titleRuneSize="answer-title"
								bodyRuneSize="answer-body"
								selected={selectedQuestionId === qId}
								disabled={!canAnswer}
								dancing
								danceDelay={`-${questionIndex * 620}ms`}
								receiveTransition={receiveQuestionCard}
								sendTransition={sendQuestionCard}
								transitionKey={q.id}
								onclick={() => (answerQuestionId = qId)}
								type="button"
							/>
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
					<GameCard
						variant="clue"
						title={q.title}
						bodyText={clue.value}
						bodyFancy={Boolean(clue.value)}
						bodyRedacted={!clue.value}
						redactionKey={`${q.id}:clue`}
						bodyRune={{ words: 3, min: 3, max: 8 }}
						bodyRuneSize="clue-body"
					/>
				{/if}
			</div>
		{/if}

		{#if currentState === 'win' || currentState === 'lose'}
			<GameCard
				variant="result"
				result={currentState}
				title={currentState === 'win' ? 'Won' : 'Lost'}
				bodyText={game.word}
				bodyFancy
				footerVisible={showStartPanel}
			>
				{#snippet footer()}
					{#if showStartPanel}
						<InkButton size="md" primary onclick={() => send({ type: 'start' })}>Reset</InkButton>
					{/if}
				{/snippet}
			</GameCard>
		{/if}
	</div>

	{#if canSeeVote(currentState, 'pickWord')}
		{@const canPickWord = canVote(currentState, game, 'pickWord', viewerId)}
		<div class="pick-word-stage">
			<div class="pick-word" data-can-vote={canPickWord}>
				{#each wordCard(game).words as word, wordIndex}
					{@const voteState = optionVoteState(currentState, game, 'pickWord', wordIndex)}
					<button
						class="word-option"
						data-voted={voteState.voted.includes(viewerId)}
						disabled={!canPickWord}
						onclick={() => send({ type: 'vote', action: 'pickWord', option: wordIndex, userId: viewerId })}
						type="button"
					>
						<span class="word-option-label">
							{#if canPickWord}
								<span class="word-text">{word}</span>
							{:else}
								<GameRunes hash={`${game.wordCardId}:${wordIndex}`} />
							{/if}
						</span>
						{@render VoteStack(voteState)}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if hasActionFooter}
		<div class="action-footer-shell" transition:fly={{ y: 22, duration: 180 }}>
			<footer
				class="action-footer"
				class:keyboard-dock={actionFooterKind === 'keyboard'}
				data-can-answer={actionFooterKind === 'answer' && canAnswerSpirit(game, viewerId) ? 'true' : undefined}
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
								disabled={!canVote(currentState, game, 'mediumAction', viewerId)}
								onclick={() => send({ type: 'vote', action: 'mediumAction', option, userId: viewerId })}
								selfVoted={voteState.voted.includes(viewerId)}
								voteLabel={voteLabel(option)}
								voting={voteState}
							>
								{voteLabel(option)}
							</InkButton>
						{/each}
					</div>
				{:else if canSeeVote(currentState, 'pickQuestions')}
					{@const canPickQuestions = canVote(currentState, game, 'pickQuestions', viewerId)}
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
					{@const canAnswer = canAnswerSpirit(game, viewerId)}
					{@const selectedQuestionId = selectedAnswerQuestionId(game)}
					{@const selectedQuestion = selectedQuestionId
						? questions.find(question => question.id === selectedQuestionId)!
						: undefined}
					<form
						class="answer-action-row"
						data-can-answer={canAnswer}
						onsubmit={event => {
							event.preventDefault();
							if (selectedQuestionId) answerClue(selectedQuestionId);
						}}
					>
						<div class="answer-input-row">
							<button
								class="answer-question-toggle"
								onclick={() => (questionsMinimized = !questionsMinimized)}
								type="button"
							>
								{#if questionsMinimized}
									<Maximize2 size={18} />
								{:else}
									<Minimize2 size={18} />
								{/if}
							</button>
							<span class="answer-input-frame">
								<input
									disabled={!canAnswer || !selectedQuestionId}
									oninput={event => {
										if (selectedQuestionId) {
											const clue = event.currentTarget.value.toUpperCase();
											event.currentTarget.value = clue;
											clueDrafts[selectedQuestionId] = clue;
										}
									}}
									placeholder={canAnswer ? (selectedQuestion?.question ?? '') : 'Clue'}
									value={selectedQuestionId ? (clueDrafts[selectedQuestionId] ?? '') : ''}
								/>
							</span>
							{#if canAnswer}
								<span class="answer-word">{game.word.toUpperCase()}</span>
							{/if}
							<InkButton
								size="md"
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
								disabled={!canVote(currentState, game, 'clue', viewerId)}
								onclick={() => send({ type: 'vote', action: 'clue', option, userId: viewerId })}
								selfVoted={voteState.voted.includes(viewerId)}
								voteLabel={voteLabel(option)}
								voting={voteState}
							>
								{option === 'getClue' ? 'Reveal' : 'Silencio'}
							</InkButton>
						{/each}
					</div>
				{:else if canSeeVote(currentState, 'guessLetter')}
					{@const canGuess = canVote(currentState, game, 'guessLetter', viewerId)}
					<div class="ansi-keyboard" data-can-vote={canGuess}>
						{#each config.keyboardRows as row, rowIndex (rowIndex)}
							<div class="keyboard-row" data-row={rowIndex}>
								{#each row as option (option)}
									{@const voteState = optionVoteState(currentState, game, 'guessLetter', option)}
									<button
										class="key-button"
										class:space-key={option === ' '}
										data-key={option === ' ' ? 'space' : option}
										data-voted={voteState.voted.includes(viewerId)}
										disabled={!canGuess}
										onclick={() => send({ type: 'vote', action: 'guessLetter', option, userId: viewerId })}
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
	.game-screen {
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

	:global(.content-card:has(.game-screen)) {
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

	.game-screen[data-state='mediumsAsk']:not([data-questions-minimized='true']) .game-content {
		overflow: hidden;
	}

	.game-screen[data-state='spiritAnswers']:not([data-questions-minimized='true']) .game-content {
		overflow: hidden;
	}

	.board {
		position: relative;
		z-index: 1;
		min-width: 0;
		max-width: 100%;
		overflow-x: clip;
	}

	.team-presence {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2rem minmax(0, 1fr);
		min-width: 0;
		min-height: clamp(5.8rem, 15dvh, 7.4rem);
		margin: -0.35rem -0.35rem 0;
		overflow: hidden;
	}

	.team-presence::after {
		position: absolute;
		top: 0.75rem;
		bottom: 0.55rem;
		left: 50%;
		width: 1px;
		background: color-mix(in oklab, var(--app-border) 48%, transparent);
		box-shadow:
			-0.45rem 0 1.45rem color-mix(in oklab, #e1aa57 28%, transparent),
			0.45rem 0 1.45rem color-mix(in oklab, #a997ff 32%, transparent);
		content: '';
		pointer-events: none;
		transform: translateX(-50%);
	}

	.team-presence-side {
		--team-color: var(--app-accent);
		position: relative;
		display: grid;
		align-content: end;
		min-width: 0;
		padding: 0.85rem 0.7rem 0.55rem;
		overflow: hidden;
	}

	.team-presence-side[data-team='sun'] {
		--team-color: #e1aa57;
		justify-items: start;
	}

	.team-presence-side[data-team='moon'] {
		--team-color: #a997ff;
		justify-items: end;
	}

	.team-presence-gap {
		position: relative;
		z-index: 1;
	}

	.team-mark {
		position: absolute;
		top: 0.2rem;
		display: grid;
		width: 5.4rem;
		height: 5.4rem;
		color: color-mix(in oklab, var(--team-color) 68%, transparent);
		filter: drop-shadow(0 0 0.45rem color-mix(in oklab, var(--team-color) 30%, transparent))
			drop-shadow(0 0 1.2rem color-mix(in oklab, var(--team-color) 14%, transparent));
		opacity: 0.38;
		pointer-events: none;
		place-items: center;
		transition:
			color 180ms ease,
			opacity 180ms ease,
			filter 180ms ease;
	}

	.team-mark::before {
		position: absolute;
		inset: -0.4rem;
		border-radius: 999px;
		background: radial-gradient(
			circle,
			color-mix(in oklab, var(--team-color) 32%, transparent) 0%,
			color-mix(in oklab, var(--team-color) 14%, transparent) 38%,
			transparent 72%
		);
		content: '';
		opacity: 0.32;
		transform: scale(0.9);
	}

	.team-mark :global(svg) {
		position: relative;
		z-index: 1;
	}

	.team-presence-side[data-active='true'] .team-mark {
		animation: team-icon-pulse 3.8s ease-in-out infinite;
		color: var(--team-color);
		opacity: 0.9;
	}

	.team-presence-side[data-active='true'] .team-mark::before {
		animation: team-aura-pulse 3.8s ease-in-out infinite;
		opacity: 0.72;
	}

	.team-presence-side[data-team='sun'] .team-mark {
		left: 0.55rem;
	}

	.team-presence-side[data-team='moon'] .team-mark {
		right: 0.55rem;
	}

	.team-player-list {
		position: relative;
		z-index: 1;
		display: grid;
		gap: 0.38rem;
		min-width: 0;
		width: 100%;
		padding-top: 2.4rem;
	}

	.team-presence-side[data-team='moon'] .team-player-list {
		justify-items: end;
	}

	.team-player {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		max-width: 100%;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--app-text);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 900;
		line-height: 1;
		padding: 0.08rem 0;
		text-align: left;
		transition:
			color 180ms ease,
			filter 180ms ease,
			opacity 180ms ease,
			transform 180ms ease;
	}

	button.team-player {
		cursor: pointer;
	}

	button.team-player:hover,
	button.team-player:focus-visible {
		color: color-mix(in oklab, var(--team-color) 72%, var(--app-text) 28%);
		transform: translateY(-0.05rem);
	}

	.team-presence-side[data-team='moon'] .team-player {
		flex-direction: row-reverse;
		text-align: right;
	}

	.team-player[data-active='false'] {
		opacity: 0.38;
		filter: saturate(0.52);
	}

	.team-player[data-viewer='true'] {
		color: var(--team-color);
		filter: drop-shadow(0 0 0.42rem color-mix(in oklab, var(--team-color) 30%, transparent));
	}

	.team-player[data-active='false'][data-viewer='true'] {
		opacity: 0.58;
	}

	.team-player[data-spirit='true'] .team-player-name {
		color: color-mix(in oklab, var(--logo-word) 86%, var(--team-color) 14%);
		font-family: var(--font-fancy);
		font-size: 1.04rem;
		font-weight: 950;
		text-shadow:
			0 0 0.38rem color-mix(in oklab, var(--team-color) 28%, transparent),
			0 0.08rem 0.16rem color-mix(in oklab, black 42%, transparent);
	}

	.team-player :global(.avatar) {
		display: inline-grid;
		place-items: center;
		width: 1.55rem;
		height: 1.55rem;
		flex: 0 0 auto;
		font-size: 1.55rem;
	}

	.team-player :global(.avatar svg) {
		width: 1.2rem;
		height: 1.2rem;
	}

	.team-player-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	button {
		border: 1px solid var(--app-border);
		border-radius: 2px;
		padding: 0.45rem 0.6rem;
		background: var(--app-input);
		color: inherit;
	}

	button:disabled {
		opacity: 0.45;
	}

	.action-footer-shell {
		flex: 0 0 auto;
		z-index: 40;
		overflow: visible;
	}

	.action-footer {
		border-top: 1px solid var(--app-border);
		background: var(--app-panel);
		box-shadow: 0 -0.22rem 0.7rem color-mix(in srgb, black 14%, transparent);
		overflow: visible;
		padding: 1rem 1rem 0.5rem;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			box-shadow 180ms ease;
	}

	.action-footer[data-footer-kind='answer'][data-can-answer='true']:not(:focus-within) {
		animation: answer-action-highlight 1800ms ease-in-out infinite;
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
	.answer-question-toggle,
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
	.answer-question-toggle:hover,
	.answer-question-toggle:focus-visible,
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

	.answer-question-overlay {
		position: absolute;
		inset: 0;
		z-index: 30;
		display: grid;
		align-items: end;
		justify-items: center;
		min-width: 0;
		min-height: 0;
		padding: 0.75rem clamp(0.65rem, 2.4vw, 1.25rem) clamp(0.85rem, 2dvh, 1.15rem);
		pointer-events: none;
	}

	.answer-question-stage {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: clamp(0.7rem, 2.4vw, 1.15rem);
		width: min(100%, 54rem);
		min-width: 0;
		perspective: 62rem;
		pointer-events: auto;
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
		width: min(100%, 24rem);
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
		pointer-events: auto;
		transform: translateY(0) scale(1);
		transform-style: preserve-3d;
		transition:
			border-color 220ms ease,
			box-shadow 260ms ease,
			filter 260ms ease,
			transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.pick-word-stage {
		position: absolute;
		inset: 0;
		z-index: 30;
		display: grid;
		place-items: center;
		min-width: 0;
		min-height: 0;
		padding: 1rem;
		pointer-events: none;
		perspective: 58rem;
	}

	.pick-word:hover,
	.pick-word-stage:focus-within .pick-word {
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

	.answer-question-toggle {
		position: relative;
		z-index: 1;
		flex: 0 0 auto;
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

	.clue-stage {
		display: grid;
		gap: 0.85rem;
	}

	.answer-input-row {
		position: relative;
		z-index: 1;
		display: flex;
		gap: 0.65rem;
		align-items: center;
	}

	.answer-input-frame {
		position: relative;
		display: flex;
		min-width: 0;
		flex: 1 1 auto;
		border-radius: 0.45rem;
		overflow: visible;
	}

	.answer-input-row input {
		width: 100%;
		min-width: 0;
		height: 2.85rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 74%, transparent);
		border-radius: 0.45rem;
		background: color-mix(in oklab, var(--app-input) 86%, black 6%);
		color: var(--app-text);
		font: inherit;
		font-size: 1.05rem;
		font-weight: 800;
		padding: 0 0.9rem;
		text-transform: uppercase;
	}

	.answer-word {
		color: var(--logo-word);
		font: inherit;
		font-size: 1.05rem;
		font-weight: 800;
		line-height: 1;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.answer-input-row input::placeholder {
		text-transform: none;
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

	@keyframes answer-action-highlight {
		0%,
		100% {
			border-color: color-mix(in oklab, var(--app-sun) 20%, transparent);
			background: color-mix(in oklab, var(--app-sun) 5%, transparent);
			box-shadow: 0 0 0 0 color-mix(in oklab, var(--app-sun) 0%, transparent);
		}
		45% {
			border-color: color-mix(in oklab, var(--app-sun) 72%, var(--app-border) 28%);
			background: color-mix(in oklab, var(--app-sun) 13%, transparent);
			box-shadow:
				0 0 0 1px color-mix(in oklab, var(--app-sun) 24%, transparent),
				0 0 1.1rem color-mix(in oklab, var(--app-sun) 26%, transparent);
		}
	}

	@keyframes team-icon-pulse {
		0%,
		100% {
			filter: drop-shadow(0 0 0.55rem color-mix(in oklab, var(--team-color) 42%, transparent))
				drop-shadow(0 0 1.35rem color-mix(in oklab, var(--team-color) 24%, transparent));
		}

		50% {
			filter: drop-shadow(0 0 0.85rem color-mix(in oklab, var(--team-color) 66%, transparent))
				drop-shadow(0 0 1.85rem color-mix(in oklab, var(--team-color) 36%, transparent));
		}
	}

	@keyframes team-aura-pulse {
		0%,
		100% {
			opacity: 0.52;
			transform: scale(0.92);
		}

		50% {
			opacity: 0.9;
			transform: scale(1.06);
		}
	}

	@media (min-width: 700px) {
		:global(.content-card:has(.game-screen)) {
			height: min(calc(100dvh - 6.4rem), 50rem);
			max-height: min(calc(100dvh - 6.4rem), 50rem);
		}
	}

	@media (max-width: 420px) {
		:global(.content-card:has(.game-screen)) {
			height: calc(100dvh - 5.7rem);
			max-height: calc(100dvh - 5.7rem);
		}
	}

	@media (max-width: 460px) {
		.team-presence {
			min-height: 5.55rem;
			margin-inline: -0.55rem;
		}

		.team-presence-side {
			padding: 0.65rem 0.55rem 0.45rem;
		}

		.team-mark {
			top: 0.05rem;
			width: 4.8rem;
			height: 4.8rem;
		}

		.team-player-list {
			gap: 0.32rem;
			padding-top: 2.05rem;
		}

		.team-player {
			gap: 0.32rem;
			font-size: 0.8rem;
		}

		.team-player[data-spirit='true'] .team-player-name {
			font-size: 0.94rem;
		}

		.team-player :global(.avatar) {
			width: 1.38rem;
			height: 1.38rem;
			font-size: 1.38rem;
		}

		.team-player :global(.avatar svg) {
			width: 1.08rem;
			height: 1.08rem;
		}

		.pick-word {
			gap: 0.45rem;
			width: min(100%, 22rem);
			padding: 0.65rem;
		}

		button.word-option {
			min-height: 2.75rem;
			padding: 0.56rem 0.65rem;
		}

		.word-text {
			font-size: 1.03rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.action-footer[data-footer-kind='answer'][data-can-answer='true']:not(:focus-within) {
			animation: none;
		}
	}
</style>
