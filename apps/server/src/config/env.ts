import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or local directory if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('SyncForge'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
  SERVER_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  REQUEST_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1048576), // 1MB
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres_dev_password@localhost:5432/syncforge_dev'),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  AUTH_SECRET: z
    .string()
    .min(16)
    .default('development_only_secret_change_in_production_min_32_chars'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): EnvConfig {
  const result = EnvSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `SyncForge environment configuration validation failed:\n${errorDetails}\nCheck your .env file or environment variables.`,
    );
  }
  return result.data;
}

export const env = parseEnv();
