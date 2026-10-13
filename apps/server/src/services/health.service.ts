import {
  HealthCheckResponse,
  ReadinessCheckResponse,
  SYNCFORGE_PROTOCOL_VERSION,
} from '@syncforge/shared';
import { env } from '../config/env.js';
import { checkDatabaseHealth } from '../infrastructure/database.js';
import { checkRedisHealth } from '../infrastructure/redis.js';

const startTime = Date.now();

export class HealthService {
  public static getLiveness(): HealthCheckResponse {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      version: '0.1.0',
      environment: env.NODE_ENV,
    };
  }

  public static async getReadiness(): Promise<{
    isReady: boolean;
    data: ReadinessCheckResponse;
  }> {
    const [dbResult, redisResult] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

    const isReady = dbResult.status === 'healthy' && redisResult.status === 'healthy';

    const details: Record<string, string> = {};
    if (dbResult.error) details.database = dbResult.error;
    if (redisResult.error) details.redis = redisResult.error;

    return {
      isReady,
      data: {
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        dependencies: {
          database: dbResult.status,
          redis: redisResult.status,
        },
        details: Object.keys(details).length > 0 ? details : undefined,
      },
    };
  }

  public static getInfo() {
    return {
      name: env.APP_NAME,
      version: '0.1.0',
      protocolVersion: SYNCFORGE_PROTOCOL_VERSION,
      environment: env.NODE_ENV,
      capabilities: {
        websockets: 'active',
        yjsSynchronization: 'active',
        presence: 'planned_phase_2',
        collaborativeCanvas: 'planned_phase_2',
        databasePersistence: 'active',
        redisCoordination: 'configured',
      },
      endpoints: {
        health: '/healthz',
        readiness: '/readyz',
        info: '/api/v1/info',
      },
    };
  }
}
