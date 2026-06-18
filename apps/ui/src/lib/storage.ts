import {
	DEFAULT_PLAYER_COLOR,
	DEFAULT_PLAYER_ICON,
	type PlayerColorId,
	type PlayerIconId,
} from '@repo/shared/onlineGame';
import createLocalStorage from './createLocalStorage';

export interface StorageShape {
	current_room: string | null;
	dark_mode: boolean;
	player_color: PlayerColorId;
	player_icon: PlayerIconId;
	player_name: string;
	server_client_key: string | null;
	server_user_id: number | null;
}

const defaults: StorageShape = {
	current_room: null,
	dark_mode: true,
	player_color: DEFAULT_PLAYER_COLOR,
	player_icon: DEFAULT_PLAYER_ICON,
	player_name: '',
	server_client_key: null,
	server_user_id: null,
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
	const stored = LS.get('server_client_key');
	return stored?.trim() ? stored : null;
}

export function getStoredClientKey(): string {
	const stored = readStoredClientKey();
	if (stored) return stored;

	const next =
		typeof crypto !== 'undefined' && crypto.randomUUID
			? crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	LS.set({ server_client_key: next });
	return next;
}
