import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

export const invitationBoard = pgTable('invitation_board', {
  id: text('id').primaryKey(),
  families: jsonb('families').notNull(),
  positions: jsonb('positions').notNull(),
  sidebar: jsonb('sidebar'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool)
