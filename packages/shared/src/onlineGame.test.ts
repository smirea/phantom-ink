import { describe, expect, test } from 'bun:test';
import {
	applyOnlineRoomAction,
	createInitialOnlineRoomState,
	playerIdForUser,
	type OnlineRoomState,
} from './onlineGame';

describe('online game actions', () => {
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
