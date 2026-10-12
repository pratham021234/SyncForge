import { Pool } from 'pg';
import { env } from '../config/env.js';

let poolInstance: Pool | null = null;

export function getDatabasePool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_MAX_CONNECTIONS,
      connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
    });

    poolInstance.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }
  return poolInstance;
}

/**
 * Health check probe for PostgreSQL
 * Runs a simple SELECT 1 with strict timeout
 */
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  error?: string;
}> {
  try {
    const pool = getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('SELECT 1 AS health_check');
      return { status: 'healthy' };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      status: 'unhealthy',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function closeDatabasePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
