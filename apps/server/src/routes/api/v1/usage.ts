import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UsageService } from '../../../services/usage.service.js';
import { AuthManagerService } from '../../../services/auth-manager.service.js';
import { createAuthHook } from '../../../middlewares/auth.middleware.js';
import { UsageMetric } from '../../../types/control-plane.js';

const UsageQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  metric: z
    .enum(['connections', 'room_joins', 'doc_update_bytes', 'persisted_bytes'] as const)
    .optional(),
});

export const usageRoutes: FastifyPluginAsync<{
  usageService?: UsageService;
  authManagerService?: AuthManagerService;
}> = async (fastify, opts) => {
  const usageService = opts.usageService ?? new UsageService();
  const authManagerService = opts.authManagerService ?? new AuthManagerService();
  const requireAuth = createAuthHook(authManagerService);

  fastify.addHook('preHandler', requireAuth);

  // 1. Get project usage metrics and plan limits
  fastify.get<{
    Params: { projectId: string };
    Querystring: { from?: string; to?: string; metric?: string };
  }>('/projects/:projectId/usage', async (request, reply) => {
    const { projectId } = request.params;
    const parseResult = UsageQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0]?.message ?? 'Invalid usage query parameters',
        },
      });
    }

    const userId = request.user!.userId;
    const from = parseResult.data.from ? new Date(parseResult.data.from) : undefined;
    const to = parseResult.data.to ? new Date(parseResult.data.to) : undefined;
    const metric = parseResult.data.metric as UsageMetric | undefined;

    const usageData = await usageService.getProjectUsage({
      projectId,
      userId,
      from,
      to,
      metric,
    });

    return reply.send({ data: usageData });
  });
};
