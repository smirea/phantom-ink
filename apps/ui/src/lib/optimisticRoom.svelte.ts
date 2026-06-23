import {
	applyOnlineRoomAction,
	createInitialOnlineRoomState,
	playerIdForUser,
	selectRoomViewState,
	type OnlineRoomState,
	type RoomViewState,
	type User,
} from '@repo/shared/onlineGame';

export function optimisticJoinedRoom(state: OnlineRoomState, user: User): RoomViewState {
	const next = structuredClone($state.snapshot(state));
	joinRoom(next, user);
	return selectRoomViewState(next, user.id, 'connecting');
}

export function optimisticNewRoom(user: User): RoomViewState {
	const state = createInitialOnlineRoomState();
	joinRoom(state, user);
	return selectRoomViewState(state, user.id, 'connecting');
}

function joinRoom(state: OnlineRoomState, user: User): void {
	applyOnlineRoomAction(state, {
		type: 'join',
		actorId: playerIdForUser(user.id),
		userId: user.id,
		name: user.name,
		color: user.color,
		icon: user.icon,
	});
}
