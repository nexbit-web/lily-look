import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../prisma/generated/client.js';

/**
 * Єдиний екземпляр Prisma Client на процес.
 *
 * Клієнт створюється лениво, при першому зверненні: інакше `npm run dev`
 * падав би ще до того, як розробник встиг прописати DATABASE_URL.
 * У dev-режимі екземпляр кешується на globalThis, щоб HMR не плодив пули.
 */
const globalForPrisma = globalThis as typeof globalThis & {
	__lilyLookPrisma?: PrismaClient;
};

/**
 * Чи налаштоване підключення. Дозволяє показати інструкцію із сетапу
 * замість стектрейсу, поки розробник ще не завів базу в Neon.
 */
export function isDatabaseConfigured(): boolean {
	return Boolean(env.DATABASE_URL);
}

function createClient(): PrismaClient {
	const connectionString = env.DATABASE_URL;

	if (!connectionString) {
		throw new Error(
			'DATABASE_URL не заданий. Скопіюй .env.example у .env і додай рядок підключення з console.neon.tech.'
		);
	}

	return new PrismaClient({
		adapter: new PrismaPg({
			connectionString,
			// Neon-пулер уже тримає з'єднання за нас, тому на боці процесу
			// вистачає невеликого пулу — це головне, що рятує serverless.
			max: 5,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 10_000
		}),
		log: dev ? ['warn', 'error'] : ['error']
	});
}

function getClient(): PrismaClient {
	globalForPrisma.__lilyLookPrisma ??= createClient();
	return globalForPrisma.__lilyLookPrisma;
}

/** Проксі дає звичний синтаксис `db.product.findMany()` без раннього конекту. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
	get(_target, property) {
		const client = getClient();
		const value = Reflect.get(client, property, client);
		return typeof value === 'function' ? value.bind(client) : value;
	}
});
