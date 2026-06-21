<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import GameScreen from '$lib/GameScreen.svelte';
	import { gameMachine, gameStates, type GameEvent, type GameState, type VoteType } from '@repo/shared/game';
	import type { User } from '@repo/shared/onlineGame';
	import type { Team } from '@repo/shared/types';
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

	function send(event: GameEvent) {
		actor.send(event);
	}

	function player(userId: User['id']): User {
		return playerData.find(user => user.id === userId)!;
	}

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
					send({
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
						onclick={() => send({ type: 'debugSetTeam', state: currentState, team: team as Team })}
						type="button"
					>
						{team}
					</button>
				{/each}
			</div>
		</div>

		<div class="debug-active-user">
			<Avatar user={player(debugUser)} />
		</div>

		<button onclick={() => send({ type: 'start' })} type="button">
			{currentState === 'start' ? 'Start' : 'Reset'}
		</button>
	</header>

	<GameScreen
		{game}
		state={currentState}
		players={playerData}
		viewerId={debugUser}
		{send}
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
	.team-toggle,
	.debug-active-user {
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

	.debug-active-user {
		font-size: 1.5rem;
		min-width: 5rem;
		justify-content: center;
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
