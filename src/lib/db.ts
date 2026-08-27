import { createDb, type DB } from 'mitto-lib-ts-orm'
import { env } from '@/config/env'

export * from 'mitto-lib-ts-orm'

export const db: DB = createDb(env.DATABASE_URL)
