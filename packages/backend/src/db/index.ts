import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  getDbPoolMax,
  getDbIdleTimeoutMs,
  getDbConnectionTimeoutMs,
} from '../lib/env.js';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL']!,
  max: getDbPoolMax(),
  idleTimeoutMillis: getDbIdleTimeoutMs(),
  connectionTimeoutMillis: getDbConnectionTimeoutMs(),
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;