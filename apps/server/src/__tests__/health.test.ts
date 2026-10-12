import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { closeDatabasePool } from '../infrastructure/database.js';
import { closeRedisClient } from '../infrastructure/redis.js';

describe('Server HTTP Endpoints', () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
    await closeDatabasePool();
    await closeRedisClient();
  });

  describe('GET /healthz', () => {
    it('should return 200 with status ok and uptime', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ok');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('uptimeSeconds');
      expect(body).toHaveProperty('version');
    });
  });

  describe('GET /readyz', () => {
    it('should return valid JSON with dependency statuses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/readyz',
      });

      // May be 200 (if docker services are running) or 503 (if services are down in clean unit test environment)
      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('dependencies');
      expect(body.dependencies).toHaveProperty('database');
      expect(body.dependencies).toHaveProperty('redis');
    });
  });

  describe('GET /api/v1/info', () => {
    it('should return 200 with service information and capabilities', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/info',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('SyncForge');
      expect(body.protocolVersion).toBe('1.0.0');
      expect(body).toHaveProperty('capabilities');
    });
  });

  describe('404 Route Not Found', () => {
    it('should return 404 with structured JSON error payload', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent-route',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('ROUTE_NOT_FOUND');
      expect(body.error).toHaveProperty('requestId');
    });
  });
});
