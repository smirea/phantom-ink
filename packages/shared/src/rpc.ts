import { eventIterator, oc, type as orpcType } from '@orpc/contract';
import type { ContractRouterClient } from '@orpc/contract';
import type { OnlineRoomAction, RoomDirectoryListing, RoomViewState, User } from './onlineGame';

export interface UserLookupInput {
	userId?: User['id'] | null;
}

export interface SaveUserInput extends UserLookupInput {
	name?: User['name'] | null;
	color?: User['color'] | null;
	icon?: User['icon'] | null;
}

export interface RoomInput {
	code: string;
	userId?: User['id'] | null;
}

export interface RoomActionInput extends RoomInput {
	action: OnlineRoomAction;
}

export const appContract = {
	status: oc.output(orpcType<{ ok: true; now: string }>()),
	users: {
		save: oc.input(orpcType<SaveUserInput>()).output(orpcType<{ user: User }>()),
		get: oc.input(orpcType<UserLookupInput>()).output(orpcType<{ user: User | null }>()),
		currentRoom: oc.input(orpcType<UserLookupInput>()).output(orpcType<{ roomCode: string | null }>()),
	},
	presence: {
		ping: oc.input(orpcType<UserLookupInput>()).output(orpcType<{ ok: true; timeoutMs: number }>()),
		online: oc.input(orpcType<UserLookupInput>()).output(orpcType<{ users: User[] }>()),
	},
	rooms: {
		list: oc.output(orpcType<{ rooms: RoomDirectoryListing[] }>()),
		get: oc.input(orpcType<RoomInput>()).output(orpcType<{ room: RoomViewState }>()),
		join: oc.input(orpcType<RoomInput>()).output(orpcType<{ room: RoomViewState }>()),
		action: oc.input(orpcType<RoomActionInput>()).output(orpcType<{ room: RoomViewState }>()),
		events: oc.input(orpcType<RoomInput>()).output(eventIterator(orpcType<{ room: RoomViewState }>())),
	},
};

export type AppContract = typeof appContract;
export type AppRouterClient = ContractRouterClient<AppContract>;
