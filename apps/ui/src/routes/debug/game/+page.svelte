<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import GameScreen from '$lib/GameScreen.svelte';
	import { gameMachine, gameStates, type GameEvent, type GameState } from '@repo/shared/game';
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
</script>

<div class="debug-game-shell">
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

		<div class="debug-user-switcher">
			{#each playerData as user (user.id)}
				<button class:active-user={user.id === debugUser} onclick={() => (debugUser = user.id)} type="button">
					<Avatar {user} name={false} />
				</button>
			{/each}
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
	.debug-user-switcher {
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

	.team-toggle {
		gap: 0.4rem;
	}

	.debug-user-switcher {
		gap: 0.2rem;
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

	.debug-user-switcher button {
		display: inline-grid;
		place-items: center;
		padding: 0.28rem;
		background: transparent;
	}

	.active-toggle,
	.active-user {
		background: color-mix(in srgb, var(--app-accent) 16%, transparent) !important;
	}
</style>
