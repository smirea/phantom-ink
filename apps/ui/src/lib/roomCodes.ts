import { ROOM_CODE_LENGTH } from '@repo/shared/onlineGame';

export function parseRoomCode(raw: string | null | undefined): string | null {
	const candidate = raw?.trim() ?? '';
	if (candidate.length !== ROOM_CODE_LENGTH || /[^A-Za-z]/.test(candidate)) return null;
	return candidate.toUpperCase();
}
