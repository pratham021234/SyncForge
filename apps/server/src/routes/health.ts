import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { HealthService } from '../services/health.service.js';

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Liveness probe: returns 200 as long as the server process is responsive
  fastify.get('/healthz', async (_request, reply) => {
    const liveness = HealthService.getLiveness();
    return reply.status(200).send(liveness);
  });

  // Readiness probe: verifies that required infrastructure dependencies are responsive
  fastify.get('/readyz', async (_request, reply) => {
    const { isReady, data } = await HealthService.getReadiness();
    const statusCode = isReady ? 200 : 503;
    return reply.status(statusCode).send(data);
  });
};
