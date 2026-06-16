import type { PhantomInkGameState } from '@repo/shared/game';
import {
	DEFAULT_PLAYER_COLOR,
	DEFAULT_PLAYER_ICON,
	type PlayerColorId,
	type PlayerIconId,
} from '@repo/shared/onlineGame';
import createLocalStorage from './createLocalStorage';

export const storageKeys = {
	currentRoom: 'current_room',
	darkMode: 'dark_mode',
	playerColor: 'player_color',
	playerIcon: 'player_icon',
	playerName: 'player_name',
	savedState: 'saved_state',
	serverClientKey: 'server_client_key',
	serverUserId: 'server_user_id',
} as const;

export type StorageKey = (typeof storageKeys)[keyof typeof storageKeys];

export interface StorageShape {
	[storageKeys.currentRoom]: string | null;
	[storageKeys.darkMode]: boolean;
	[storageKeys.playerColor]: PlayerColorId;
	[storageKeys.playerIcon]: PlayerIconId;
	[storageKeys.playerName]: string;
	[storageKeys.savedState]: PhantomInkGameState | null;
	[storageKeys.serverClientKey]: string | null;
	[storageKeys.serverUserId]: number | null;
}

const defaults: StorageShape = {
	[storageKeys.currentRoom]: null,
	[storageKeys.darkMode]: true,
	[storageKeys.playerColor]: DEFAULT_PLAYER_COLOR,
	[storageKeys.playerIcon]: DEFAULT_PLAYER_ICON,
	[storageKeys.playerName]: '',
	[storageKeys.savedState]: null,
	[storageKeys.serverClientKey]: null,
	[storageKeys.serverUserId]: null,
};

const searchParams = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
export const DEBUG_ID = searchParams.get('DEBUG_ID') || searchParams.get('debug_id') || null;
const storageNamespace = `phantom-ink${DEBUG_ID ? `-DEBUG_ID=${DEBUG_ID}` : ''}`;
export const { LS } = createLocalStorage<StorageShape>({
	namespace: storageNamespace,
	getDefaults: () => defaults,
});

export function getDebugId(): string | null {
	return DEBUG_ID;
}

export function readStoredClientKey(): string | null {
	const stored = LS.get(storageKeys.serverClientKey);
	return stored?.trim() ? stored : null;
}

export function getStoredClientKey(): string {
	const stored = readStoredClientKey();
	if (stored) return stored;

	const next =
		typeof crypto !== 'undefined' && crypto.randomUUID
			? crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	LS.set({ [storageKeys.serverClientKey]: next });
	return next;
}
