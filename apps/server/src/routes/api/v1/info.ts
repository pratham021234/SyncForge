import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { HealthService } from '../../../services/health.service.js';

export const infoRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/info', async (_request, reply) => {
    const info = HealthService.getInfo();
    return reply.status(200).send(info);
  });
};
