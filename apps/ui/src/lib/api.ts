import {
	DEFAULT_PLAYER_COLOR,
	DEFAULT_PLAYER_ICON,
	playerIdForUser,
	type OnlineRoomAction,
	type PlayerColorId,
	type PlayerIconId,
	type RoomDirectoryListing,
	type RoomViewState,
	type User,
} from '@repo/shared/onlineGame';
import type { AppRouterClient } from '@repo/shared/rpc';
import { consumeEventIterator, createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { getStoredClientKey, LS, readStoredClientKey } from './storage';
import { parseRoomCode } from './roomCodes';

const api = createORPCClient<AppRouterClient>(
	new RPCLink({
		url: () => new URL('/api/rpc', typeof location === 'undefined' ? 'http://localhost' : location.origin),
	}),
);

export interface RoomEventSubscription {
	close: () => void;
}

export function getStoredUserId(): number | null {
	const userId = LS.get('server_user_id');
	return typeof userId === 'number' && Number.isInteger(userId) && userId > 0 ? userId : null;
}

export async function loadStoredUser(): Promise<User | null> {
	const userId = getStoredUserId();
	const clientKey = readStoredClientKey();
	if (!userId && !clientKey) return null;

	const payload = await api.users.me({ userId, clientKey });
	if (payload.user) {
		LS.set({
			server_user_id: payload.user.id,
			player_name: payload.user.name,
			player_color: payload.user.color,
			player_icon: payload.user.icon,
		});
	}
	return payload.user;
}

export async function ensureUser(profile: { name: string; color: PlayerColorId; icon: PlayerIconId }): Promise<User> {
	const payload = await api.users.ensure({
		userId: getStoredUserId(),
		clientKey: getStoredClientKey(),
		...profile,
	});
	LS.set({
		server_user_id: payload.user.id,
		player_name: payload.user.name,
		player_color: payload.user.color,
		player_icon: payload.user.icon,
	});
	return payload.user;
}

export async function getCurrentRoom(): Promise<string | null> {
	const userId = getStoredUserId();
	const clientKey = getStoredClientKey();

	const payload = await api.users.currentRoom({
		userId,
		clientKey,
	});
	return payload.roomCode;
}

export async function getRoomDirectory(): Promise<RoomDirectoryListing[]> {
	const payload = await api.rooms.list();
	return payload.rooms;
}

export async function getOnlineUsers(): Promise<User[]> {
	const userId = getStoredUserId();
	const clientKey = readStoredClientKey();

	const payload = await api.presence.online({ userId, clientKey });
	return payload.users;
}

export async function pingPresence(): Promise<void> {
	const userId = getStoredUserId();
	const clientKey = readStoredClientKey();
	if (!userId && !clientKey) return;

	await api.presence.ping({ userId, clientKey });
}

export async function joinRoom(code: string, name: string): Promise<RoomViewState> {
	const roomCode = requireRoomCode(code);
	const user = await ensureUser({
		name,
		color: LS.get('player_color', DEFAULT_PLAYER_COLOR),
		icon: LS.get('player_icon', DEFAULT_PLAYER_ICON),
	});
	const payload = await api.rooms.join({ code: roomCode, userId: user.id });
	LS.set({ current_room: roomCode });
	return payload.room;
}

export async function sendRoomAction(code: string, action: OnlineRoomAction): Promise<RoomViewState> {
	const roomCode = requireRoomCode(code);
	const userId = getStoredUserId();
	if (!userId) throw new Error('Missing user');

	const payload = await api.rooms.action({ code: roomCode, userId, action });
	return payload.room;
}

export async function leaveRoomForStoredUser(code: string): Promise<void> {
	const roomCode = parseRoomCode(code);
	const userId = getStoredUserId();
	if (!roomCode || !userId) return;

	await sendRoomAction(roomCode, { type: 'leave', actorId: playerIdForUser(userId) });
}

export function openRoomEvents(
	code: string,
	onRoom: (room: RoomViewState) => void,
	onError: () => void,
): RoomEventSubscription {
	const roomCode = requireRoomCode(code);
	const userId = getStoredUserId();

	const cancel = consumeEventIterator(api.rooms.events({ code: roomCode, userId }), {
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
