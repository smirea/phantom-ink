import { describe, expect, test } from 'bun:test';
import {
	applyOnlineRoomAction,
	createInitialOnlineRoomState,
	playerIdForUser,
	type OnlineRoomState,
} from './onlineGame';

describe('online room', () => {
	test('spectators cannot vote in the lobby and are left out of the game it starts', () => {
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

	test('spectators cannot vote on game moves', () => {
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

	test('a player can cast a game vote only as themselves', () => {
		const state = createPlayingRoom();
		const spirit = memberForUser(state, currentSpiritUserId(state));
		const { currentTeam, teams } = state.gameState!.context;
		const otherSpirit = teams[currentTeam === 'sun' ? 'moon' : 'sun'].spirit;

		expect(
			applyOnlineRoomAction(state, {
				type: 'game-action',
				actorId: spirit.id,
				action: { type: 'vote', action: 'pickWord', option: 0, userId: otherSpirit },
			}),
		).toBe(false);
		expect(state.gameState?.context.voting.pickWord).toBeUndefined();

		expect(
			applyOnlineRoomAction(state, {
				type: 'game-action',
				actorId: spirit.id,
				action: { type: 'vote', action: 'pickWord', option: 0, userId: spirit.userId },
			}),
		).toBe(true);
		expect(state.gameState?.context.voting.pickWord?.[spirit.userId]).toEqual([0]);
	});

	test('a player cannot make a game move directly, only through a consensus vote', () => {
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

	test('a finished game returns to the lobby by consensus and the next game picks spirits who have not been one yet', () => {
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
