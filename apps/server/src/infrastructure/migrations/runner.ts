import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getDatabasePool, closeDatabasePool } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureMigrationTable(): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS syncforge_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

export async function getMigrationStatus(): Promise<{
  applied: Array<{ name: string; applied_at: Date; checksum: string }>;
  pending: string[];
}> {
  await ensureMigrationTable();
  const pool = getDatabasePool();

  const result = await pool.query<{ name: string; applied_at: Date; checksum: string }>(
    'SELECT name, applied_at, checksum FROM syncforge_migrations ORDER BY id ASC;',
  );

  const appliedMap = new Map(result.rows.map((row) => [row.name, row]));
  const migrationFiles = fs
    .readdirSync(__dirname)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const pending = migrationFiles.filter((file) => !appliedMap.has(file));

  return {
    applied: result.rows,
    pending,
  };
}

export async function runMigrationsUp(): Promise<string[]> {
  await ensureMigrationTable();
  const pool = getDatabasePool();
  const status = await getMigrationStatus();

  const newlyApplied: string[] = [];

  for (const file of status.pending) {
    const filePath = path.join(__dirname, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const checksum = calculateChecksum(content);

    const client = await pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query(content);
      await client.query('INSERT INTO syncforge_migrations (name, checksum) VALUES ($1, $2);', [
        file,
        checksum,
      ]);
      await client.query('COMMIT;');
      newlyApplied.push(file);
      console.info(`✓ Applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK;');
      throw new Error(
        `Failed to apply migration ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      client.release();
    }
  }

  return newlyApplied;
}

// CLI entry point
if (process.argv[1] === __filename) {
  const command = process.argv[2] ?? 'status';

  (async () => {
    try {
      if (command === 'up') {
        console.info('Starting SyncForge database migrations...');
        const applied = await runMigrationsUp();
        if (applied.length === 0) {
          console.info('No pending migrations. Database is up to date.');
        } else {
          console.info(`Successfully applied ${applied.length} migration(s).`);
        }
      } else if (command === 'status') {
        const { applied, pending } = await getMigrationStatus();
        console.info('--- SyncForge Migration Status ---');
        console.info(`Applied (${applied.length}):`);
        applied.forEach((m) =>
          console.info(`  ✓ ${m.name} [applied at ${m.applied_at.toISOString()}]`),
        );
        console.info(`Pending (${pending.length}):`);
        pending.forEach((m) => console.info(`  ○ ${m}`));
      } else {
        console.error(`Unknown command: ${command}. Use 'up' or 'status'.`);
        process.exitCode = 1;
      }
    } catch (err) {
      console.error('Migration error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      await closeDatabasePool();
    }
  })();
}
