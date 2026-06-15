import type { PhantomInkGameState } from '@repo/shared/game';

export const storageKeys = {
	currentRoom: 'current_room',
	darkMode: 'dark_mode',
	playerName: 'player_name',
	savedState: 'saved_state',
	serverClientKey: 'server_client_key',
	serverUserId: 'server_user_id',
} as const;

export type StorageKey = (typeof storageKeys)[keyof typeof storageKeys];

export interface StorageShape {
	[storageKeys.currentRoom]: string | null;
	[storageKeys.darkMode]: boolean;
	[storageKeys.playerName]: string;
	[storageKeys.savedState]: PhantomInkGameState | null;
	[storageKeys.serverClientKey]: string | null;
	[storageKeys.serverUserId]: number | null;
}

const defaults: StorageShape = {
	[storageKeys.currentRoom]: null,
	[storageKeys.darkMode]: true,
	[storageKeys.playerName]: '',
	[storageKeys.savedState]: null,
	[storageKeys.serverClientKey]: null,
	[storageKeys.serverUserId]: null,
};

const searchParams = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
export const DEBUG_ID = searchParams.get('DEBUG_ID') || searchParams.get('debug_id') || null;
const prefix = `phantom-ink${DEBUG_ID ? `-DEBUG_ID=${DEBUG_ID}` : ''}:`;

export function getDebugId(): string | null {
	return DEBUG_ID;
}

export function getStored<K extends StorageKey>(key: K): StorageShape[K] {
	if (typeof localStorage === 'undefined') return defaults[key];

	try {
		const raw = localStorage.getItem(prefix + key);
		return raw === null ? defaults[key] : (JSON.parse(raw) as StorageShape[K]);
	} catch {
		deleteStored(key);
		return defaults[key];
	}
}

export function setStored<K extends StorageKey>(key: K, value: StorageShape[K]): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(prefix + key, JSON.stringify(value));
}

export function deleteStored(key: StorageKey): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(prefix + key);
}

export function getStoredClientKey(): string {
	const stored = getStored(storageKeys.serverClientKey);
	if (stored) return stored;

	const next =
		typeof crypto !== 'undefined' && crypto.randomUUID
			? crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	setStored(storageKeys.serverClientKey, next);
	return next;
}
