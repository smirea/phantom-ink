import {
	playerIdForUser,
	type OnlineRoomAction,
	type RoomDirectoryListing,
	type RoomViewState,
	type User,
} from '@repo/shared/onlineGame';
import type { AppRouterClient } from '@repo/shared/rpc';
import { consumeEventIterator, createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { LS } from './storage';
import { parseRoomCode } from './roomCodes';

export const api = createORPCClient<AppRouterClient>(
	new RPCLink({
		url: () => new URL('/api/rpc', typeof location === 'undefined' ? 'http://localhost' : location.origin),
	}),
);

export interface RoomEventSubscription {
	close: () => void;
}

type UserProfile = Pick<User, 'id' | 'name' | 'color' | 'icon'>;

export async function saveUser(user: UserProfile): Promise<User> {
	const payload = await api.users.ensure({
		userId: serverUserId(user.id),
		name: user.name,
		color: user.color,
		icon: user.icon,
	});
	LS.set({ userId: payload.user.id });
	return payload.user;
}

export async function getRoomDirectory(): Promise<RoomDirectoryListing[]> {
	const payload = await api.rooms.list();
	return payload.rooms;
}

export async function getOnlineUsers(userId: User['id'] | null): Promise<User[]> {
	const payload = await api.presence.online({ userId: serverUserId(userId) });
	return payload.users;
}

export async function pingPresence(userId: User['id'] | null): Promise<void> {
	const serverId = serverUserId(userId);
	if (!serverId) return;

	await api.presence.ping({ userId: serverId });
}

export async function joinRoom(code: string, user: UserProfile): Promise<RoomViewState> {
	const roomCode = requireRoomCode(code);
	const userId = serverUserId(user.id);
	if (!userId) throw new Error('Missing user');

	const payload = await api.rooms.join({ code: roomCode, userId });
	return payload.room;
}

export async function sendRoomAction(
	code: string,
	userId: User['id'] | null,
	action: OnlineRoomAction,
): Promise<RoomViewState> {
	const roomCode = requireRoomCode(code);
	const serverId = serverUserId(userId);
	if (!serverId) throw new Error('Missing user');

	const payload = await api.rooms.action({ code: roomCode, userId: serverId, action });
	return payload.room;
}

export async function leaveRoomForUser(code: string, userId: User['id'] | null): Promise<void> {
	const roomCode = parseRoomCode(code);
	const serverId = serverUserId(userId);
	if (!roomCode || !serverId) return;

	await sendRoomAction(roomCode, serverId, { type: 'leave', actorId: playerIdForUser(serverId) });
}

export function openRoomEvents(
	code: string,
	userId: User['id'] | null,
	onRoom: (room: RoomViewState) => void,
	onError: () => void,
): RoomEventSubscription {
	const roomCode = requireRoomCode(code);

	const cancel = consumeEventIterator(api.rooms.events({ code: roomCode, userId: serverUserId(userId) }), {
		onEvent: payload => onRoom(payload.room),
		onError: () => onError(),
	});

	return {
		close: () => {
			void cancel();
		},
	};
}

function requireRoomCode(value: string): string {
	const code = parseRoomCode(value);
	if (!code) throw new Error('Room codes must be 4 letters');
	return code;
}

function serverUserId(value: User['id'] | null): User['id'] | null {
	return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}
