import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PlayerColorId, PlayerIconId } from '../playerProfile';

export const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	color: text('color', { mode: 'text', length: 16 }).$type<PlayerColorId>().notNull(),
	icon: text('icon', { mode: 'text', length: 16 }).$type<PlayerIconId>().notNull(),
	createdAt: text('created_at').notNull(),
	updatedAt: text('updated_at').notNull(),
});

export const publicUserColumns = {
	id: usersTable.id,
	name: usersTable.name,
	color: usersTable.color,
	icon: usersTable.icon,
} as const;

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

export type UserRow = typeof usersTable.$inferSelect;
export type UserInsert = typeof usersTable.$inferInsert;
export type User = Pick<UserRow, keyof typeof publicUserColumns>;
export type RoomRow = typeof roomsTable.$inferSelect;
export type RoomActionRow = typeof roomActionsTable.$inferSelect;
