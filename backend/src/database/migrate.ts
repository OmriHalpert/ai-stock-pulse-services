import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { Pool } from 'pg';

const logger = new Logger('Migrate');

// Arbitrary constant so two backend pods do not apply the same file twice.
const MIGRATION_LOCK_ID = 74628301;

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const dir = join(__dirname, 'migrations');
    const files = (await readdir(dir))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();

    const applied = await pool.query<{ id: string }>(
      'SELECT id FROM schema_migrations',
    );
    const done = new Set(applied.rows.map((row) => row.id));

    for (const file of files) {
      const id = file.replace(/\.sql$/, '');
      if (done.has(id)) {
        logger.log(`Skip ${id} (already applied)`);
        continue;
      }

      const sql = await readFile(join(dir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [
          id,
        ]);
        await client.query('COMMIT');
        logger.log(`Applied ${id}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
  }
}
