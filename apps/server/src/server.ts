import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabasePool } from './infrastructure/database.js';
import { closeRedisClient } from './infrastructure/redis.js';

async function startServer(): Promise<void> {
  const app = buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Graceful shutdown initiated...');

    try {
      // 1. Broadcast shutdown notification to connected WebSocket sessions
      if (app.gateway) {
        app.gateway.broadcastShutdown();
        app.log.info('WebSocket sessions notified of shutdown.');
      }

      // 2. Drain all in-flight persistence operations and destroy rooms
      if (app.roomManager) {
        await app.roomManager.shutdown();
        app.log.info('RoomManager persistence drained and active rooms destroyed.');
      }

      // 3. Stop receiving new HTTP / WebSocket connections
      await app.close();
      app.log.info('Fastify server closed.');

      // 4. Close database pool
      await closeDatabasePool();
      app.log.info('PostgreSQL connection pool closed.');

      // 5. Close Redis connection
      await closeRedisClient();
      app.log.info('Redis connection closed.');

      app.log.info('SyncForge server shutdown completed cleanly.');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    const address = await app.listen({
      host: env.SERVER_HOST,
      port: env.SERVER_PORT,
    });

    app.log.info(
      {
        address,
        port: env.SERVER_PORT,
        host: env.SERVER_HOST,
        publicUrl: env.SERVER_PUBLIC_URL,
        nodeEnv: env.NODE_ENV,
      },
      `⚡ SyncForge server started successfully`,
    );
  } catch (err) {
    app.log.error({ err }, 'Failed to start SyncForge server');
    process.exit(1);
  }
}

void startServer();
