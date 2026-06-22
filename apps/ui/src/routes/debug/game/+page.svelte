<script lang="ts">
	import GameScreen from '$lib/GameScreen.svelte';
	import { questions } from '@repo/shared/data';
	import { gameMachine, gameStates, type GameEvent, type GameState, type VoteType } from '@repo/shared/game';
	import type { User } from '@repo/shared/onlineGame';
	import type { Team } from '@repo/shared/types';
	import { range } from 'es-toolkit';
	import { onDestroy } from 'svelte';
	import { createActor } from 'xstate';

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
	const currentTeam = $derived(game.teams[game.currentTeam]);
	const debugActionState = $derived(actionStateFor(currentState));
	let debugUser = $state<User['id']>(0);

	const playerData: User[] = [
		{ id: 0, name: 'one', color: 'ash', icon: 'angry' },
		{ id: 1, name: 'two', color: 'bloodink', icon: 'bug' },
		{ id: 2, name: 'three', color: 'bone', icon: 'cat' },
		{ id: 3, name: 'four', color: 'brass', icon: 'drama' },
		{ id: 4, name: 'five', color: 'ectoplasm', icon: 'fish' },
		{ id: 5, name: 'six', color: 'haunt', icon: 'skull' },
	];

	function actionStateFor(state: GameState): VoteType | 'answer' | undefined {
		switch (state) {
			case 'setupWord':
				return 'pickWord';
			case 'mediumsTurn':
				return 'mediumAction';
			case 'eyeHint':
				return 'pickHint';
			case 'mediumsAsk':
				return 'pickQuestions';
			case 'spiritAnswers':
				return 'answer';
			case 'mediumsGetClues':
				return 'clue';
			case 'guessing':
				return 'guessLetter';
		}
	}

	const debug = {
		state: (state: GameState, team: Team = game.currentTeam) =>
			actor.send({
				type: 'debugSetState',
				state,
				team,
			}),
		clues: (n: number) => {
			debug.state('mediumsGetClues');
			range(n).forEach(() => actor.send({ type: 'getClue' }));
		},
		pickQuestions: (q1: number, q2: number) =>
			actor.send({
				type: 'pickQuestions',
				questionIds: [currentTeam.questions[q1], currentTeam.questions[q2]],
			}),
		spiritAnswer: (clue: string, questionId = currentTeam.spiritQuestionPicks[0]) =>
			actor.send({
				type: 'answer',
				clue,
				questionId,
			}),
	};

	debug.state('setupWord');
	actor.send({
		type: 'pickWord',
		word: 'potato',
	});
	debug.state('mediumsTurn');
	debug.state('mediumsAsk');
	debug.pickQuestions(2, 3);
	// debug.spiritAnswer('brown');
	// debug.clues(3);
	// debug.state('guessing');
</script>

<div
	class="debug-game-shell"
	data-state={currentState}
	data-action-state={debugActionState}
	data-debug-user={debugUser}
>
	<header class="debug-game-controls">
		<div class="debug-control-group">
			<select
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

			<div class="team-toggle">
				{#each ['sun', 'moon'] as team}
					<button
						class:active-toggle={team === currentTeamName}
						onclick={() => actor.send({ type: 'debugSetTeam', state: currentState, team: team as Team })}
						type="button"
					>
						{team}
					</button>
				{/each}
			</div>
		</div>

		<button onclick={() => actor.send({ type: 'start' })} type="button">
			{currentState === 'start' ? 'Start' : 'Reset'}
		</button>
	</header>

	<GameScreen
		{game}
		state={currentState}
		players={playerData}
		viewerId={debugUser}
		send={actor.send}
		onSelectViewer={userId => (debugUser = userId)}
		showDebugPlayerPicker
		showStartPanel
	/>
</div>

<style>
	.debug-game-shell {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.debug-game-controls,
	.debug-control-group,
	.team-toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.debug-game-controls {
		justify-content: space-between;
		flex: 0 0 auto;
		border-bottom: 1px solid var(--app-border);
		padding: 0.8rem 1rem;
	}

	.debug-game-controls > button {
		margin-left: auto;
	}

	.team-toggle {
		gap: 0.4rem;
	}

	button,
	select {
		border: 1px solid var(--app-border);
		border-radius: 2px;
		background: var(--app-input);
		color: inherit;
		padding: 0.45rem 0.6rem;
	}

	.team-toggle button {
		background: transparent;
	}

	.active-toggle {
		background: color-mix(in srgb, var(--app-accent) 16%, transparent) !important;
	}
</style>
