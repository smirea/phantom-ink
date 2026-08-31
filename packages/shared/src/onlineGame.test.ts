import { describe, expect, test } from 'bun:test';
import {
	applyOnlineRoomAction,
	createInitialOnlineRoomState,
	playerIdForUser,
	type OnlineRoomState,
} from './onlineGame';
import { applyPhantomInkGameAction, createInitialGameState } from './game';

describe('online game actions', () => {
	test('excludes spectators from room votes and the started game', () => {
		const state = createInitialOnlineRoomState();

		for (const userId of [1, 2, 3, 4, 5]) {
			applyOnlineRoomAction(state, {
				type: 'join',
				actorId: playerIdForUser(userId),
				userId,
				name: `Soul ${userId}`,
			});
		}

		const spectator = memberForUser(state, 5);
		expect(
			applyOnlineRoomAction(state, {
				type: 'set-seat',
				actorId: spectator.id,
				team: spectator.team,
				role: 'spectator',
			}),
		).toBe(true);
		expect(
			applyOnlineRoomAction(state, {
				type: 'vote',
				actorId: spectator.id,
				vote: { type: 'ready' },
			}),
		).toBe(false);

		for (const member of state.members.filter(member => member.role !== 'spectator')) {
			applyOnlineRoomAction(state, {
				type: 'vote',
				actorId: member.id,
				vote: { type: 'ready' },
			});
		}

		expect(state.phase).toBe('playing');
		expect(state.gameState?.context.teams.sun.players).not.toContain(spectator.userId);
		expect(state.gameState?.context.teams.moon.players).not.toContain(spectator.userId);
	});

	test('rejects game actions from spectators', () => {
		const state = createPlayingRoom();
		const spiritUserId = currentSpiritUserId(state);
		const spirit = memberForUser(state, spiritUserId);
		spirit.role = 'spectator';

		const changed = applyOnlineRoomAction(state, {
			type: 'game-action',
			actorId: spirit.id,
			action: { type: 'vote', action: 'pickWord', option: 0, userId: spirit.userId },
		});

		expect(changed).toBe(false);
		expect(state.gameState?.context.voting.pickWord).toBeUndefined();
	});

	test('returns spectators to their previous team', () => {
		const state = createInitialOnlineRoomState();
		applyOnlineRoomAction(state, {
			type: 'join',
			actorId: playerIdForUser(1),
			userId: 1,
			name: 'Soul 1',
		});
		const member = memberForUser(state, 1);
		const originalTeam = member.team;

		applyOnlineRoomAction(state, {
			type: 'set-seat',
			actorId: member.id,
			team: originalTeam,
			role: 'spectator',
		});
		expect(member.role).toBe('spectator');

		applyOnlineRoomAction(state, {
			type: 'set-seat',
			actorId: member.id,
			team: member.team,
			role: 'medium',
		});
		expect(member).toMatchObject({ role: 'medium', team: originalTeam });
	});

	test('accepts votes from the matching room actor', () => {
		const state = createPlayingRoom();
		const spiritUserId = currentSpiritUserId(state);
		const spirit = memberForUser(state, spiritUserId);

		const changed = applyOnlineRoomAction(state, {
			type: 'game-action',
			actorId: spirit.id,
			action: { type: 'vote', action: 'pickWord', option: 0, userId: spirit.userId },
		});

		expect(changed).toBe(true);
		expect(state.gameState?.context.voting.pickWord?.[spirit.userId]).toEqual([0]);
	});

	test('rejects game votes for a different user', () => {
		const state = createPlayingRoom();
		const spiritUserId = currentSpiritUserId(state);
		const spirit = memberForUser(state, spiritUserId);
		const other = state.members.find(member => member.userId !== spirit.userId)!;

		const changed = applyOnlineRoomAction(state, {
			type: 'game-action',
			actorId: spirit.id,
			action: { type: 'vote', action: 'pickWord', option: 0, userId: other.userId },
		});

		expect(changed).toBe(false);
		expect(state.gameState?.context.voting.pickWord).toBeUndefined();
	});

	test('rejects direct game events that should come from consensus', () => {
		const state = createPlayingRoom();
		const spiritUserId = currentSpiritUserId(state);
		const spirit = memberForUser(state, spiritUserId);

		const changed = applyOnlineRoomAction(state, {
			type: 'game-action',
			actorId: spirit.id,
			action: { type: 'pickWord', word: 'SHADOW' },
		});

		expect(changed).toBe(false);
		expect(state.gameState?.state).toBe('setupWord');
	});

	test('loads a supplied debug state through the room action log', () => {
		const state = createInitialOnlineRoomState();
		applyOnlineRoomAction(state, {
			type: 'join',
			actorId: playerIdForUser(1),
			userId: 1,
			name: 'Soul 1',
		});
		const loaded = createInitialGameState();
		applyPhantomInkGameAction(loaded, { type: 'pickWord', word: 'POTATO' });

		const changed = applyOnlineRoomAction(state, {
			type: 'load-state',
			actorId: playerIdForUser(1),
			state: loaded,
		});

		expect(changed).toBe(true);
		expect(state.phase).toBe('playing');
		expect(state.gameState).toEqual(loaded);
		expect(state.gameState).not.toBe(loaded);
	});

	test('returns completed games to the lobby by consensus and rotates spirits', () => {
		const state = createPlayingRoom();
		const firstSpirits = {
			sun: state.gameState!.context.teams.sun.spirit,
			moon: state.gameState!.context.teams.moon.spirit,
		};
		expect(state.spiritHistory).toEqual([firstSpirits.sun, firstSpirits.moon]);
		state.gameState!.state = 'win';

		for (const member of state.members) {
			applyOnlineRoomAction(state, {
				type: 'vote',
				actorId: member.id,
				vote: { type: 'new-game' },
			});
		}

		expect(state.phase).toBe('lobby');
		expect(state.gameState).toBeNull();

		for (const member of state.members) {
			applyOnlineRoomAction(state, {
				type: 'vote',
				actorId: member.id,
				vote: { type: 'ready' },
			});
		}

		expect(state.gameState!.context.teams.sun.spirit).not.toBe(firstSpirits.sun);
		expect(state.gameState!.context.teams.moon.spirit).not.toBe(firstSpirits.moon);
		expect(new Set(state.spiritHistory)).toHaveLength(4);
	});
});

function createPlayingRoom(): OnlineRoomState {
	const state = createInitialOnlineRoomState();

	for (const userId of [1, 2, 3, 4]) {
		applyOnlineRoomAction(state, {
			type: 'join',
			actorId: playerIdForUser(userId),
			userId,
			name: `Soul ${userId}`,
		});
	}

	for (const member of state.members) {
		applyOnlineRoomAction(state, {
			type: 'vote',
			actorId: member.id,
			vote: { type: 'ready' },
		});
	}

	expect(state.phase).toBe('playing');
	expect(state.gameState).not.toBeNull();
	return state;
}

function currentSpiritUserId(state: OnlineRoomState): number {
	const game = state.gameState!;
	return game.context.teams[game.context.currentTeam].spirit;
}

function memberForUser(state: OnlineRoomState, userId: number) {
	return state.members.find(member => member.userId === userId)!;
}
