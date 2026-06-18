import { eventIterator, oc, type as orpcType } from '@orpc/contract';
import type { ContractRouterClient } from '@orpc/contract';
import type {
	CurrentRoomResponse,
	CurrentUserResponse,
	DirectoryResponse,
	OnlinePresenceResponse,
	OnlineRoomAction,
	RoomResponse,
	UserResponse,
} from './onlineGame';

export interface UserLookupInput {
	userId?: number | null;
	clientKey?: string | null;
}

export interface EnsureUserInput extends UserLookupInput {
	name?: string | null;
	color?: string | null;
	icon?: string | null;
}

export interface RoomInput {
	code: string;
	userId?: number | null;
}

export type JoinRoomInput = RoomInput;

export interface RoomActionInput extends RoomInput {
	action: OnlineRoomAction;
}

export interface StatusResponse {
	ok: true;
	now: string;
}

export interface PresencePingResponse {
	ok: true;
	timeoutMs: number;
}

export const appContract = {
	status: oc.output(orpcType<StatusResponse>()),
	users: {
		ensure: oc.input(orpcType<EnsureUserInput>()).output(orpcType<UserResponse>()),
		me: oc.input(orpcType<UserLookupInput>()).output(orpcType<CurrentUserResponse>()),
		currentRoom: oc.input(orpcType<UserLookupInput>()).output(orpcType<CurrentRoomResponse>()),
	},
	presence: {
		ping: oc.input(orpcType<UserLookupInput>()).output(orpcType<PresencePingResponse>()),
		online: oc.input(orpcType<UserLookupInput>()).output(orpcType<OnlinePresenceResponse>()),
	},
	rooms: {
		list: oc.output(orpcType<DirectoryResponse>()),
		get: oc.input(orpcType<RoomInput>()).output(orpcType<RoomResponse>()),
		join: oc.input(orpcType<JoinRoomInput>()).output(orpcType<RoomResponse>()),
		action: oc.input(orpcType<RoomActionInput>()).output(orpcType<RoomResponse>()),
		events: oc.input(orpcType<RoomInput>()).output(eventIterator(orpcType<RoomResponse>())),
	},
};

export type AppContract = typeof appContract;
export type AppRouterClient = ContractRouterClient<AppContract>;
