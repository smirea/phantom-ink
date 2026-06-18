import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const usersTable = sqliteTable(
	'users',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		clientKey: text('client_key'),
		name: text('name').notNull(),
		color: text('color', { mode: 'text', length: 16 }).notNull(),
		icon: text('icon', { mode: 'text', length: 16 }).notNull(),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
	},
	table => [
		uniqueIndex('users_client_key_idx')
			.on(table.clientKey)
			.where(sql`${table.clientKey} is not null`),
	],
);

export const roomsTable = sqliteTable('rooms', {
	code: text('code').primaryKey(),
	createdAt: text('created_at').notNull(),
	updatedAt: text('updated_at').notNull(),
});

export const roomActionsTable = sqliteTable(
	'room_actions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		roomCode: text('room_code')
			.notNull()
			.references(() => roomsTable.code),
		userId: integer('user_id')
			.notNull()
			.references(() => usersTable.id),
		type: text('type').notNull(),
		payload: text('payload').notNull(),
		createdAt: text('created_at').notNull(),
	},
	table => [index('room_actions_room_code_id_idx').on(table.roomCode, table.id)],
);
