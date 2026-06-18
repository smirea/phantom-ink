import { mkdirSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL ?? './.data/phantom-ink.sqlite';

if (!process.env.DATABASE_URL) {
	mkdirSync('./.data', { recursive: true });
}

export default defineConfig({
	schema: './packages/shared/src/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		url: databaseUrl,
	},
});
