import {
	DEFAULT_PLAYER_COLOR,
	DEFAULT_PLAYER_ICON,
	playerIdForUser,
	type CurrentUserResponse,
	type CurrentRoomResponse,
	type DirectoryResponse,
	type OnlineRoomAction,
	type PlayerColorId,
	type PlayerIconId,
	type RoomDirectoryListing,
	type RoomResponse,
	type RoomViewState,
	type UserRecord,
	type UserResponse,
} from '@repo/shared/onlineGame';
import { getStoredClientKey, LS, readStoredClientKey, storageKeys } from './storage';
import { parseRoomCode } from './roomCodes';

const apiBase = '/api';

export function getStoredUserId(): number | null {
	const userId = LS.get(storageKeys.serverUserId);
	return typeof userId === 'number' && Number.isInteger(userId) && userId > 0 ? userId : null;
}

export async function loadStoredUser(): Promise<UserRecord | null> {
	const params = new URLSearchParams();
	const userId = getStoredUserId();
	const clientKey = readStoredClientKey();
	if (userId) params.set('userId', String(userId));
	if (clientKey) params.set('clientKey', clientKey);
	if (!params.size) return null;

	const payload = await readJson<CurrentUserResponse>(
		await fetch(`${apiBase}/users/me?${params.toString()}`, {
			headers: { Accept: 'application/json' },
		}),
	);
	if (payload.user) {
		LS.set({
			[storageKeys.serverUserId]: payload.user.id,
			[storageKeys.playerName]: payload.user.name,
			[storageKeys.playerColor]: payload.user.color,
			[storageKeys.playerIcon]: payload.user.icon,
		});
	}
	return payload.user;
}

export async function ensureUser(profile: {
	name: string;
	color: PlayerColorId;
	icon: PlayerIconId;
}): Promise<UserRecord> {
	const payload = await readJson<UserResponse>(
		await fetch(`${apiBase}/users`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				userId: getStoredUserId(),
				clientKey: getStoredClientKey(),
				...profile,
			}),
		}),
	);
	LS.set({
		[storageKeys.serverUserId]: payload.user.id,
		[storageKeys.playerName]: payload.user.name,
		[storageKeys.playerColor]: payload.user.color,
		[storageKeys.playerIcon]: payload.user.icon,
	});
	return payload.user;
}

export async function getCurrentRoom(): Promise<string | null> {
	const params = new URLSearchParams();
	const userId = getStoredUserId();
	if (userId) params.set('userId', String(userId));
	params.set('clientKey', getStoredClientKey());

	const payload = await readJson<CurrentRoomResponse>(
		await fetch(`${apiBase}/users/current-room?${params.toString()}`, {
			headers: { Accept: 'application/json' },
		}),
	);
	return payload.roomCode;
}

export async function getRoomDirectory(): Promise<RoomDirectoryListing[]> {
	const payload = await readJson<DirectoryResponse>(
		await fetch(`${apiBase}/rooms`, { headers: { Accept: 'application/json' } }),
	);
	return payload.rooms;
}

export async function pingPresence(): Promise<void> {
	const userId = getStoredUserId();
	const clientKey = readStoredClientKey();
	if (!userId && !clientKey) return;

	await readJson<{ ok: boolean }>(
		await fetch(`${apiBase}/presence/ping`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId, clientKey }),
		}),
	);
}

export async function joinRoom(code: string, name: string): Promise<RoomViewState> {
	const roomCode = requireRoomCode(code);
	const user = await ensureUser({
		name,
		color: LS.get(storageKeys.playerColor, DEFAULT_PLAYER_COLOR),
		icon: LS.get(storageKeys.playerIcon, DEFAULT_PLAYER_ICON),
	});
	const payload = await readJson<RoomResponse>(
		await fetch(`${apiBase}/rooms/${encodeURIComponent(roomCode)}/join`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				userId: user.id,
				clientKey: getStoredClientKey(),
				name: user.name,
				color: user.color,
				icon: user.icon,
			}),
		}),
	);
	LS.set({ [storageKeys.currentRoom]: roomCode });
	return payload.room;
}

export async function sendRoomAction(code: string, action: OnlineRoomAction): Promise<RoomViewState> {
	const roomCode = requireRoomCode(code);
	const userId = getStoredUserId();
	if (!userId) throw new Error('Missing user');

	const payload = await readJson<RoomResponse>(
		await fetch(`${apiBase}/rooms/${encodeURIComponent(roomCode)}/actions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId, action }),
		}),
	);
	return payload.room;
}

export async function leaveRoomForStoredUser(code: string): Promise<void> {
	const roomCode = parseRoomCode(code);
	const userId = getStoredUserId();
	if (!roomCode || !userId) return;

	await sendRoomAction(roomCode, { type: 'leave', actorId: playerIdForUser(userId) });
}

export function openRoomEvents(code: string, onRoom: (room: RoomViewState) => void, onError: () => void): EventSource {
	const roomCode = requireRoomCode(code);
	const userId = getStoredUserId();
	const params = new URLSearchParams();
	if (userId) params.set('userId', String(userId));

	const events = new EventSource(`${apiBase}/rooms/${encodeURIComponent(roomCode)}/events?${params.toString()}`);
	const updateRoom = (event: Event) => {
		try {
			const payload = JSON.parse((event as MessageEvent<string>).data) as RoomResponse;
			onRoom(payload.room);
		} catch {
			onError();
		}
	};
	events.addEventListener('room', updateRoom);
	events.onmessage = updateRoom;
	events.onerror = onError;
	return events;
}

async function readJson<T>(response: Response): Promise<T> {
	const payload = (await response.json()) as T | { error: string };
	if (!response.ok) {
		const message =
			typeof payload === 'object' && payload !== null && 'error' in payload
				? String(payload.error)
				: `Request failed with ${response.status}`;
		throw new Error(message);
	}

	return payload as T;
}

function requireRoomCode(value: string): string {
	const code = parseRoomCode(value);
	if (!code) throw new Error('Room codes must be 4 letters');
	return code;
}
