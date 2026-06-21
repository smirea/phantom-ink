import { parseRoomCode } from '$lib/roomCodes';
import type { PageLoad } from './$types';

export const prerender = false;

export const load: PageLoad = ({ params }) => {
	if (params.code === 'new') {
		return {
			isCreatingRoom: true,
			roomCode: null,
		};
	}

	return {
		isCreatingRoom: false,
		roomCode: parseRoomCode(params.code),
	};
};
