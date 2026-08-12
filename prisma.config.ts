import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
		seed: 'tsx prisma/seed.ts'
	},
	datasource: {
		// Для міграцій потрібне пряме (non-pooled) з'єднання з Neon.
		// У проді додатку віддаємо пул — див. src/lib/server/db.ts.
		url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL']
	}
});
