import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { implement, ORPCError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { asc, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import env from '@repo/shared/env';
import {
	applyOnlineRoomAction,
	createInitialOnlineRoomState,
	playerIdForUser,
	sanitizePlayerColor,
	sanitizePlayerIcon,
	sanitizePlayerName,
	selectRoomDirectoryListings,
	selectRoomViewState,
	type OnlineRoomAction,
	type OnlineRoomState,
	type User,
} from '@repo/shared/onlineGame';
import { appContract } from '@repo/shared/rpc';
import { publicUserColumns, roomActionsTable, roomsTable, usersTable } from '@repo/shared/db/schema';
import type { RoomActionRow, RoomRow, UserInsert, UserRow } from '@repo/shared/db/schema';

const uiBuildPath = new URL('../../ui/build/', import.meta.url);
const databaseUrl = process.env.DATABASE_URL ?? new URL('../../../.data/phantom-ink.sqlite', import.meta.url).pathname;
const sseHeartbeatMs = 5_000;
const presenceTimeoutMs = 30_000;
const serverStartedAt = Date.now();

mkdirSync(dirname(databaseUrl), { recursive: true });

const db = drizzle({
	connection: { source: databaseUrl, create: true },
	schema: { users: usersTable, rooms: roomsTable, roomActions: roomActionsTable },
});

db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

type RoomClient = {
	enqueue: (state?: OnlineRoomState) => void;
	close: () => void;
};

const roomClients = new Map<string, Set<RoomClient>>();
const roomStateCache = new Map<string, OnlineRoomState>();
const userPresence = new Map<User['id'], number>();

const os = implement(appContract);

const router = os.router({
	status: os.status.handler(() => ({ ok: true, now: nowIso() })),
	users: {
		ensure: os.users.ensure.handler(({ input }) => ({
			user: ensureUser(numberParam(input.userId), input.clientKey, input.name, input.color, input.icon),
		})),
		get: os.users.get.handler(({ input }) => {
			const user = getUserByIdOrClientKey(numberParam(input.userId), input.clientKey);
			return { user: user ? getUser(user.id) : null };
		}),
		currentRoom: os.users.currentRoom.handler(({ input }) => {
			pruneInactiveLobbyRooms();
			const user = getUserByIdOrClientKey(numberParam(input.userId), input.clientKey);
			return { roomCode: user ? findCurrentRoomForUser(user.id) : null };
		}),
	},
	presence: {
		ping: os.presence.ping.handler(({ input }) => {
			const user = getUserByIdOrClientKey(numberParam(input.userId), input.clientKey);
			if (!user) throw new ORPCError('NOT_FOUND', { message: 'User not found' });

			touchUserPresence(user.id);
			pruneInactiveLobbyRooms();
			return { ok: true, timeoutMs: presenceTimeoutMs };
		}),
		online: os.presence.online.handler(({ input }) => {
			pruneInactiveLobbyRooms();
			const currentUser = getUserByIdOrClientKey(numberParam(input.userId), input.clientKey);
			return { users: getOnlineUsers(currentUser?.id ?? null) };
		}),
	},
	rooms: {
		list: os.rooms.list.handler(() => {
			pruneInactiveLobbyRooms();
			const rooms = getRooms()
				.map(room => ({ code: room.code, state: loadRoomState(room.code) }))
				.filter(room => room.state.members.length > 0);
			return { rooms: selectRoomDirectoryListings(rooms) };
		}),
		get: os.rooms.get.handler(({ input }) => {
			pruneInactiveLobbyRooms();
			const code = requireRoomCode(input.code);
			ensureRoom(code);
			return roomResponse(code, numberParam(input.userId));
		}),
		join: os.rooms.join.handler(({ input }) => {
			pruneInactiveLobbyRooms();
			const code = requireRoomCode(input.code);
			const userId = requireUserId(input.userId);
			const user = getUser(userId);
			if (!user) throw new ORPCError('NOT_FOUND', { message: 'User not found' });

			touchUserPresence(user.id);
			leaveOtherRooms(code, user);
			const state = appendRoomAction(code, user.id, {
				type: 'join',
				actorId: playerIdForUser(user.id),
				userId: user.id,
				name: user.name,
				color: user.color,
				icon: user.icon,
			});
			return roomResponse(code, user.id, state);
		}),
		action: os.rooms.action.handler(({ input }) => {
			pruneInactiveLobbyRooms();
			const code = requireRoomCode(input.code);
			const actorUserId = requireUserId(input.userId);
			if (!input.action) throw new ORPCError('BAD_REQUEST', { message: 'action is required' });

			touchUserPresence(actorUserId);
			const state = appendRoomAction(code, actorUserId, input.action);
			return roomResponse(code, actorUserId, state);
		}),
		events: os.rooms.events.handler(({ input, signal }) => {
			pruneInactiveLobbyRooms();
			const code = requireRoomCode(input.code);
			ensureRoom(code);
			return streamRoom(code, numberParam(input.userId), signal);
		}),
	},
});

const rpcHandler = new RPCHandler(router);

const server = Bun.serve({
	development: true,
	idleTimeout: 120,
	port: env.PORT,
	async fetch(request) {
		const rpc = await rpcHandler.handle(request, { prefix: '/api/rpc', context: {} });
		if (rpc.matched) return rpc.response;

		const url = new URL(request.url);
		if (isApiPathname(url.pathname)) return Response.json({ ok: false, error: 'Not found' }, { status: 404 });

		return staticFile(url.pathname);
	},
});

function isApiPathname(pathname: string): boolean {
	return pathname === '/api' || pathname.startsWith('/api/');
}

function nowIso(): string {
	return new Date().toISOString();
}

function numberParam(value: unknown): User['id'] | null {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isInteger(number) && number > 0 ? number : null;
}

function requireUserId(value: unknown): User['id'] {
	const userId = numberParam(value);
	if (!userId) throw new ORPCError('BAD_REQUEST', { message: 'userId is required' });
	return userId;
}

function requireRoomCode(value: string): string {
	const code = value.trim().toUpperCase();
	if (!/^[A-Z]{4}$/.test(code)) throw new ORPCError('BAD_REQUEST', { message: 'Room codes must be 4 letters' });
	return code;
}

function sanitizeClientKey(value: string | null | undefined): string | null {
	const key = value?.trim() ?? '';
	return key ? key.slice(0, 128) : null;
}

function getUserRow(userId: User['id'] | null): UserRow | null {
	if (!userId) return null;
	return db.select().from(usersTable).where(eq(usersTable.id, userId)).get() ?? null;
}

function getUser(userId: User['id'] | null): User | null {
	if (!userId) return null;
	return db.select(publicUserColumns).from(usersTable).where(eq(usersTable.id, userId)).get() ?? null;
}

function getUserByClientKey(clientKey: string | null): UserRow | null {
	if (!clientKey) return null;
	return db.select().from(usersTable).where(eq(usersTable.clientKey, clientKey)).get() ?? null;
}

function getUserByIdOrClientKey(userId: User['id'] | null, clientKeyValue: string | null | undefined): UserRow | null {
	return getUserRow(userId) ?? getUserByClientKey(sanitizeClientKey(clientKeyValue));
}

function ensureUser(
	userId: User['id'] | null,
	clientKeyValue: string | null | undefined,
	rawName: string | null | undefined,
	rawColor?: string | null,
	rawIcon?: string | null,
): User {
	const name = sanitizePlayerName(rawName ?? '') ?? 'Soul';
	const color = sanitizePlayerColor(rawColor);
	const icon = sanitizePlayerIcon(rawIcon);
	const clientKey = sanitizeClientKey(clientKeyValue);
	const existing = getUserByIdOrClientKey(userId, clientKey);
	const timestamp = nowIso();

	if (existing) {
		const existingColor = sanitizePlayerColor(existing.color);
		const existingIcon = sanitizePlayerIcon(existing.icon);
		if (
			existing.name !== name ||
			existingColor !== color ||
			existingIcon !== icon ||
			(clientKey && !existing.clientKey)
		) {
			const changes: Partial<UserInsert> = { name, color, icon, updatedAt: timestamp };
			if (clientKey && !existing.clientKey) changes.clientKey = clientKey;
			db.update(usersTable).set(changes).where(eq(usersTable.id, existing.id)).run();
		}
		const user = getUser(existing.id);
		if (!user) throw new Error('Unable to load user');
		return user;
	}

	try {
		const inserted = db
			.insert(usersTable)
			.values({ clientKey, name, color, icon, createdAt: timestamp, updatedAt: timestamp })
			.returning(publicUserColumns)
			.get();
		if (!inserted) throw new Error('Unable to create user');
		return inserted;
	} catch (error) {
		const existingByKey = getUserByClientKey(clientKey);
		if (existingByKey) return ensureUser(existingByKey.id, clientKey, name, color, icon);
		throw error;
	}
}

function getRooms(): RoomRow[] {
	return db.select().from(roomsTable).orderBy(desc(roomsTable.updatedAt)).all();
}

function touchUserPresence(userId: User['id'], now = Date.now()): void {
	userPresence.set(userId, now);
}

function getOnlineUsers(excludedUserId: User['id'] | null, now = Date.now()): User[] {
	pruneExpiredPresence(now);

	const users: User[] = [];
	for (const userId of userPresence.keys()) {
		if (userId === excludedUserId) continue;

		const user = getUser(userId);
		if (user) users.push(user);
	}

	return users.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

function pruneInactiveLobbyRooms(now = Date.now()): void {
	pruneExpiredPresence(now);

	for (const room of getRooms()) {
		const state = loadRoomState(room.code);
		if (state.phase !== 'lobby') continue;

		const inactiveMembers = state.members.filter(member => !isUserOnline(member.userId, now));
		if (!inactiveMembers.length) continue;

		if (inactiveMembers.length === state.members.length) {
			deleteRoom(room.code);
			continue;
		}

		for (const member of inactiveMembers) {
			appendRoomAction(room.code, member.userId, { type: 'leave', actorId: member.id });
		}

		if (!hasActiveRoomMember(loadRoomState(room.code), now)) deleteRoom(room.code);
	}
}

function pruneExpiredPresence(now: number): void {
	for (const [userId, lastSeen] of userPresence) {
		if (now - lastSeen > presenceTimeoutMs) userPresence.delete(userId);
	}
}

function isUserOnline(userId: User['id'], now: number): boolean {
	return now - (userPresence.get(userId) ?? serverStartedAt) <= presenceTimeoutMs;
}

function hasActiveRoomMember(state: OnlineRoomState, now: number): boolean {
	return state.members.some(member => isUserOnline(member.userId, now));
}

function ensureRoom(code: string): void {
	const existing = db.select().from(roomsTable).where(eq(roomsTable.code, code)).get();
	if (existing) return;

	const timestamp = nowIso();
	db.insert(roomsTable).values({ code, createdAt: timestamp, updatedAt: timestamp }).run();
}

function deleteRoom(code: string): void {
	const clients = roomClients.get(code);
	if (clients) {
		for (const client of clients) {
			client.close();
		}
		roomClients.delete(code);
	}

	db.delete(roomActionsTable).where(eq(roomActionsTable.roomCode, code)).run();
	db.delete(roomsTable).where(eq(roomsTable.code, code)).run();
	roomStateCache.delete(code);
}

function getRoomActions(code: string): RoomActionRow[] {
	return db
		.select()
		.from(roomActionsTable)
		.where(eq(roomActionsTable.roomCode, code))
		.orderBy(asc(roomActionsTable.id))
		.all();
}

function readAction(row: RoomActionRow): OnlineRoomAction | null {
	try {
		return JSON.parse(row.payload) as OnlineRoomAction;
	} catch {
		return null;
	}
}

function loadRoomState(code: string): OnlineRoomState {
	const cached = roomStateCache.get(code);
	if (cached) return cached;

	const state = createInitialOnlineRoomState();
	for (const row of getRoomActions(code)) {
		const action = readAction(row);
		if (!action) continue;

		applyOnlineRoomAction(state, action);
		state.v = row.id;
	}

	roomStateCache.set(code, state);
	return state;
}

function appendRoomAction(code: string, userId: User['id'], action: OnlineRoomAction): OnlineRoomState {
	ensureRoom(code);
	if (action.actorId !== playerIdForUser(userId)) throw new ORPCError('FORBIDDEN', { message: 'Wrong actor' });

	const current = loadRoomState(code);
	const next = structuredClone(current);
	const changed = applyOnlineRoomAction(next, action);
	if (!changed) return current;

	const timestamp = nowIso();
	const inserted = db
		.insert(roomActionsTable)
		.values({ roomCode: code, userId, type: action.type, payload: JSON.stringify(action), createdAt: timestamp })
		.returning({ id: roomActionsTable.id })
		.get();
	if (!inserted) throw new Error('Unable to store room action');

	db.update(roomsTable).set({ updatedAt: timestamp }).where(eq(roomsTable.code, code)).run();
	next.v = inserted.id;
	roomStateCache.set(code, next);
	broadcastRoom(code, next);
	return next;
}

function leaveOtherRooms(targetCode: string, user: User): void {
	const playerId = playerIdForUser(user.id);
	for (const room of getRooms()) {
		if (room.code === targetCode) continue;

		const state = loadRoomState(room.code);
		if (!state.members.some(member => member.userId === user.id)) continue;

		appendRoomAction(room.code, user.id, { type: 'leave', actorId: playerId });
	}
}

function findCurrentRoomForUser(userId: User['id']): string | null {
	const playerId = playerIdForUser(userId);
	for (const room of getRooms()) {
		const state = loadRoomState(room.code);
		if (state.members.some(member => member.id === playerId)) return room.code;
	}

	return null;
}

function roomResponse(code: string, userId: User['id'] | null, state = loadRoomState(code)) {
	return {
		room: selectRoomViewState(state, userId, 'connected'),
	};
}

async function* streamRoom(
	code: string,
	userId: User['id'] | null,
	signal?: AbortSignal,
): AsyncGenerator<ReturnType<typeof roomResponse>, void, void> {
	const queue: ReturnType<typeof roomResponse>[] = [];
	let wake: (() => void) | undefined;
	let closed = false;

	const wakeNext = () => {
		wake?.();
		wake = undefined;
	};
	const enqueue = (state?: OnlineRoomState) => {
		queue.push(roomResponse(code, userId, state));
		wakeNext();
	};
	const client: RoomClient = {
		enqueue,
		close() {
			closed = true;
			wakeNext();
		},
	};
	const clients = roomClients.get(code) ?? new Set<RoomClient>();
	clients.add(client);
	roomClients.set(code, clients);

	const heartbeat = setInterval(() => enqueue(), sseHeartbeatMs);
	const abort = () => {
		closed = true;
		wakeNext();
	};
	signal?.addEventListener('abort', abort, { once: true });

	try {
		enqueue();
		while (!closed) {
			if (!queue.length) {
				await new Promise<void>(resolve => {
					wake = resolve;
				});
			}

			while (!closed && queue.length) {
				const next = queue.shift();
				if (next) yield next;
			}
		}
	} finally {
		clearInterval(heartbeat);
		signal?.removeEventListener('abort', abort);
		clients.delete(client);
		if (clients.size === 0) roomClients.delete(code);
	}
}

function broadcastRoom(code: string, state = loadRoomState(code)): void {
	const clients = roomClients.get(code);
	if (!clients?.size) return;

	for (const client of clients) {
		client.enqueue(state);
	}
}

async function staticFile(pathname: string): Promise<Response> {
	const path = pathname === '/' ? '/index.html' : pathname;
	const file = Bun.file(new URL(`.${path}`, uiBuildPath));

	if (await file.exists()) {
		return new Response(file);
	}

	const index = Bun.file(new URL('./index.html', uiBuildPath));
	if (await index.exists()) {
		return new Response(index);
	}

	return new Response('UI build not found. Run `bun run build` or use `bun run dev`.', {
		status: 404,
	});
}

console.log(`server listening on http://${server.hostname}:${server.port}`);
