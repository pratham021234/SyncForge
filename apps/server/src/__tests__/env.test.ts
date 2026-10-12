import { describe, it, expect } from 'vitest';
import { EnvSchema } from '../config/env.js';

describe('Server environment schema validation', () => {
  it('should pass with default configuration', () => {
    const parsed = EnvSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.SERVER_PORT).toBe(4000);
      expect(parsed.data.NODE_ENV).toBe('development');
      expect(parsed.data.LOG_LEVEL).toBe('info');
    }
  });

  it('should accept custom valid environment variables', () => {
    const custom = {
      NODE_ENV: 'production',
      SERVER_PORT: '8080',
      LOG_LEVEL: 'warn',
      CORS_ORIGIN: 'https://syncforge.dev',
      AUTH_SECRET: 'super_secret_auth_key_1234567890',
    };
    const parsed = EnvSchema.safeParse(custom);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.SERVER_PORT).toBe(8080);
      expect(parsed.data.NODE_ENV).toBe('production');
      expect(parsed.data.CORS_ORIGIN).toBe('https://syncforge.dev');
    }
  });

  it('should reject invalid ports', () => {
    const invalidLowPort = { SERVER_PORT: '500' };
    expect(EnvSchema.safeParse(invalidLowPort).success).toBe(false);

    const invalidHighPort = { SERVER_PORT: '999999' };
    expect(EnvSchema.safeParse(invalidHighPort).success).toBe(false);
  });

  it('should reject invalid log levels', () => {
    const invalidLogLevel = { LOG_LEVEL: 'verbose' };
    expect(EnvSchema.safeParse(invalidLogLevel).success).toBe(false);
  });
});
