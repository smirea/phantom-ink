import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
	type CurrentRoomResponse,
	type CurrentUserResponse,
	type DirectoryResponse,
	type OnlineRoomAction,
	type OnlineRoomState,
	type RoomResponse,
	type UserRecord,
	type UserResponse,
} from '@repo/shared/onlineGame';

const uiBuildPath = new URL('../../ui/build/', import.meta.url);
const databaseUrl = process.env.DATABASE_URL ?? new URL('../../../.data/phantom-ink.sqlite', import.meta.url).pathname;
const sseHeartbeatMs = 5_000;

mkdirSync(dirname(databaseUrl), { recursive: true });

const sqlite = new Database(databaseUrl, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id integer PRIMARY KEY AUTOINCREMENT,
		client_key text,
		name text NOT NULL,
		color text NOT NULL DEFAULT 'ectoplasm',
		icon text NOT NULL DEFAULT 'ghost',
		created_at text NOT NULL,
		updated_at text NOT NULL
	);
	CREATE TABLE IF NOT EXISTS rooms (
		code text PRIMARY KEY,
		created_at text NOT NULL,
		updated_at text NOT NULL
	);
	CREATE TABLE IF NOT EXISTS room_actions (
		id integer PRIMARY KEY AUTOINCREMENT,
		room_code text NOT NULL,
		user_id integer NOT NULL,
		type text NOT NULL,
		payload text NOT NULL,
		created_at text NOT NULL,
		FOREIGN KEY (room_code) REFERENCES rooms(code),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);
	CREATE UNIQUE INDEX IF NOT EXISTS users_client_key_idx ON users(client_key) WHERE client_key IS NOT NULL;
	CREATE INDEX IF NOT EXISTS room_actions_room_code_id_idx ON room_actions(room_code, id);
`);

type UserRow = {
	id: number;
	client_key: string | null;
	name: string;
	color: string | null;
	icon: string | null;
	created_at: string;
	updated_at: string;
};

type RoomRow = {
	code: string;
	created_at: string;
	updated_at: string;
};

type RoomActionRow = {
	id: number;
	room_code: string;
	user_id: number;
	type: string;
	payload: string;
	created_at: string;
};

type RoomClient = {
	controller: ReadableStreamDefaultController<Uint8Array>;
	userId: number | null;
};

const roomClients = new Map<string, Set<RoomClient>>();
const roomStateCache = new Map<string, OnlineRoomState>();
const encoder = new TextEncoder();

const userColumns = sqlite.query<{ name: string }, []>('PRAGMA table_info(users)').all();
if (!userColumns.some(column => column.name === 'color')) {
	sqlite.exec("ALTER TABLE users ADD COLUMN color text NOT NULL DEFAULT 'ectoplasm'");
}
if (!userColumns.some(column => column.name === 'icon')) {
	sqlite.exec("ALTER TABLE users ADD COLUMN icon text NOT NULL DEFAULT 'ghost'");
}

class HttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

const server = Bun.serve({
	development: true,
	idleTimeout: 120,
	port: env.PORT,
	async fetch(request) {
		const url = new URL(request.url);

		if (isApiPathname(url.pathname)) {
			return handleApi(request, url).catch(error => {
				if (error instanceof HttpError) {
					return json({ ok: false, error: error.message }, { status: error.status });
				}

				console.error(error);
				return json({ ok: false, error: 'Internal server error' }, { status: 500 });
			});
		}

		return staticFile(url.pathname);
	},
});

async function handleApi(request: Request, url: URL): Promise<Response> {
	const method = request.method.toUpperCase();
	const pathname = apiPathname(url.pathname);
	const roomMatch = /^\/rooms\/([A-Z]{4})(?:\/(.+))?$/.exec(pathname);

	if (method === 'GET' && pathname === '/status') {
		return json({ ok: true, now: new Date().toISOString() });
	}

	if (method === 'POST' && pathname === '/users') {
		const body = await readBody<{
			userId?: number | null;
			clientKey?: string | null;
			name?: string | null;
			color?: string | null;
			icon?: string | null;
		}>(request);
		const user = ensureUser(body.userId ?? null, body.clientKey ?? null, body.name ?? null, body.color, body.icon);
		return json({ user } satisfies UserResponse);
	}

	if (method === 'GET' && pathname === '/users/me') {
		const user = getUserByIdOrClientKey(numberParam(url.searchParams.get('userId')), url.searchParams.get('clientKey'));
		return json({ user: user ? userRecord(user) : null } satisfies CurrentUserResponse);
	}

	if (method === 'GET' && pathname === '/users/current-room') {
		const user = getUserByIdOrClientKey(numberParam(url.searchParams.get('userId')), url.searchParams.get('clientKey'));
		const roomCode = user ? findCurrentRoomForUser(user.id) : null;
		return json({ roomCode } satisfies CurrentRoomResponse);
	}

	if (method === 'GET' && pathname === '/rooms') {
		const rooms = getRooms()
			.map(room => ({ code: room.code, state: loadRoomState(room.code) }))
			.filter(room => room.state.members.length > 0);
		return json({ rooms: selectRoomDirectoryListings(rooms) } satisfies DirectoryResponse);
	}

	if (roomMatch) {
		const code = roomMatch[1] ?? '';
		const subpath = roomMatch[2] ?? '';
		const userId = numberParam(url.searchParams.get('userId'));

		if (method === 'GET' && subpath === '') {
			ensureRoom(code);
			return json(roomResponse(code, userId));
		}

		if (method === 'GET' && subpath === 'events') {
			ensureRoom(code);
			return streamRoom(code, userId);
		}

		if (method === 'POST' && subpath === 'join') {
			const body = await readBody<{
				userId?: number | null;
				clientKey?: string | null;
				name?: string | null;
				color?: string | null;
				icon?: string | null;
			}>(request);
			const user = ensureUser(body.userId ?? null, body.clientKey ?? null, body.name ?? null, body.color, body.icon);
			leaveOtherRooms(code, user);
			const state = appendRoomAction(code, user.id, {
				type: 'join',
				actorId: playerIdForUser(user.id),
				userId: user.id,
				name: user.name,
			});
			return json(roomResponse(code, user.id, state));
		}

		if (method === 'POST' && subpath === 'actions') {
			const body = await readBody<{ userId?: number | null; action?: OnlineRoomAction }>(request);
			const action = body.action;
			const actorUserId = numberParam(body.userId);
			if (!actorUserId) throw new HttpError('userId is required', 400);
			if (!action) throw new HttpError('action is required', 400);

			const state = appendRoomAction(code, actorUserId, action);
			return json(roomResponse(code, actorUserId, state));
		}
	}

	return json({ ok: false, error: 'Not found' }, { status: 404 });
}

function isApiPathname(pathname: string): boolean {
	return pathname === '/api' || pathname.startsWith('/api/');
}

function apiPathname(pathname: string): string {
	if (pathname === '/api') return '/';
	return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

function nowIso(): string {
	return new Date().toISOString();
}

function json(data: unknown, init?: ResponseInit): Response {
	return Response.json(data, init);
}

async function readBody<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		throw new HttpError('Invalid JSON', 400);
	}
}

function numberParam(value: unknown): number | null {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isInteger(number) && number > 0 ? number : null;
}

function sanitizeClientKey(value: string | null | undefined): string | null {
	const key = value?.trim() ?? '';
	return key ? key.slice(0, 128) : null;
}

function userRecord(user: UserRow): UserRecord {
	return {
		id: user.id,
		name: sanitizePlayerName(user.name) ?? 'Player',
		color: sanitizePlayerColor(user.color),
		icon: sanitizePlayerIcon(user.icon),
	};
}

function getUserRow(userId: number | null): UserRow | null {
	if (!userId) return null;
	return sqlite.query<UserRow, [number]>('SELECT * FROM users WHERE id = ?').get(userId) ?? null;
}

function getUserByClientKey(clientKey: string | null): UserRow | null {
	if (!clientKey) return null;
	return sqlite.query<UserRow, [string]>('SELECT * FROM users WHERE client_key = ?').get(clientKey) ?? null;
}

function getUserByIdOrClientKey(userId: number | null, clientKeyValue: string | null | undefined): UserRow | null {
	return getUserRow(userId) ?? getUserByClientKey(sanitizeClientKey(clientKeyValue));
}

function ensureUser(
	userId: number | null,
	clientKeyValue: string | null | undefined,
	rawName: string | null | undefined,
	rawColor?: string | null,
	rawIcon?: string | null,
): UserRecord {
	const name = sanitizePlayerName(rawName ?? '') ?? 'Player';
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
			(clientKey && !existing.client_key)
		) {
			sqlite
				.query(
					'UPDATE users SET name = ?, color = ?, icon = ?, client_key = coalesce(client_key, ?), updated_at = ? WHERE id = ?',
				)
				.run(name, color, icon, clientKey, timestamp, existing.id);
		}
		return { id: existing.id, name, color, icon };
	}

	try {
		const inserted = sqlite
			.query<UserRow, [string | null, string, string, string, string, string]>(
				'INSERT INTO users (client_key, name, color, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
			)
			.get(clientKey, name, color, icon, timestamp, timestamp);
		if (!inserted) throw new Error('Unable to create user');
		return userRecord(inserted);
	} catch (error) {
		const existingByKey = getUserByClientKey(clientKey);
		if (existingByKey) return ensureUser(existingByKey.id, clientKey, name, color, icon);
		throw error;
	}
}

function getRooms(): RoomRow[] {
	return sqlite.query<RoomRow, []>('SELECT * FROM rooms ORDER BY updated_at DESC').all();
}

function ensureRoom(code: string): void {
	const existing = sqlite.query<RoomRow, [string]>('SELECT * FROM rooms WHERE code = ?').get(code);
	if (existing) return;

	const timestamp = nowIso();
	sqlite.query('INSERT INTO rooms (code, created_at, updated_at) VALUES (?, ?, ?)').run(code, timestamp, timestamp);
}

function getRoomActions(code: string): RoomActionRow[] {
	return sqlite
		.query<RoomActionRow, [string]>('SELECT * FROM room_actions WHERE room_code = ? ORDER BY id ASC')
		.all(code);
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

function appendRoomAction(code: string, userId: number, action: OnlineRoomAction): OnlineRoomState {
	ensureRoom(code);
	if (action.actorId !== playerIdForUser(userId)) throw new HttpError('Wrong actor', 403);

	const current = loadRoomState(code);
	const next = structuredClone(current);
	const changed = applyOnlineRoomAction(next, action);
	if (!changed) return current;

	const timestamp = nowIso();
	const inserted = sqlite
		.query<{ id: number }, [string, number, string, string, string]>(
			'INSERT INTO room_actions (room_code, user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
		)
		.get(code, userId, action.type, JSON.stringify(action), timestamp);
	if (!inserted) throw new Error('Unable to store room action');

	sqlite.query('UPDATE rooms SET updated_at = ? WHERE code = ?').run(timestamp, code);
	next.v = inserted.id;
	roomStateCache.set(code, next);
	broadcastRoom(code, next);
	return next;
}

function leaveOtherRooms(targetCode: string, user: UserRecord): void {
	const playerId = playerIdForUser(user.id);
	for (const room of getRooms()) {
		if (room.code === targetCode) continue;

		const state = loadRoomState(room.code);
		if (!state.members.some(member => member.userId === user.id)) continue;

		appendRoomAction(room.code, user.id, { type: 'leave', actorId: playerId });
	}
}

function findCurrentRoomForUser(userId: number): string | null {
	const playerId = playerIdForUser(userId);
	for (const room of getRooms()) {
		const state = loadRoomState(room.code);
		if (state.members.some(member => member.id === playerId)) return room.code;
	}

	return null;
}

function roomResponse(code: string, userId: number | null, state = loadRoomState(code)): RoomResponse {
	return {
		room: selectRoomViewState(state, userId, 'connected'),
	};
}

function streamRoom(code: string, userId: number | null): Response {
	let client: RoomClient | null = null;
	let heartbeat: Timer | null = null;

	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				client = { controller, userId };
				const clients = roomClients.get(code) ?? new Set<RoomClient>();
				clients.add(client);
				roomClients.set(code, clients);
				controller.enqueue(encoder.encode('retry: 1000\n\n'));
				controller.enqueue(eventChunk(code, userId));
				heartbeat = setInterval(() => {
					try {
						controller.enqueue(encoder.encode(': heartbeat\n\n'));
					} catch {
						if (heartbeat) clearInterval(heartbeat);
					}
				}, sseHeartbeatMs);
			},
			cancel() {
				if (heartbeat) clearInterval(heartbeat);
				if (!client) return;

				const clients = roomClients.get(code);
				clients?.delete(client);
				if (clients && clients.size === 0) roomClients.delete(code);
			},
		}),
		{
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				'X-Accel-Buffering': 'no',
				Connection: 'keep-alive',
			},
		},
	);
}

function broadcastRoom(code: string, state = loadRoomState(code)): void {
	const clients = roomClients.get(code);
	if (!clients?.size) return;

	for (const client of clients) {
		try {
			client.controller.enqueue(eventChunk(code, client.userId, state));
		} catch {
			clients.delete(client);
		}
	}
}

function eventChunk(code: string, userId: number | null, state?: OnlineRoomState): Uint8Array {
	return sseChunk('room', roomResponse(code, userId, state));
}

function sseChunk(event: string, data: unknown): Uint8Array {
	return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
