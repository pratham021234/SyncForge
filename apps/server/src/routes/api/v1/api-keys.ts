import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiKeyService } from '../../../services/api-key.service.js';
import { AuthManagerService } from '../../../services/auth-manager.service.js';
import { createAuthHook } from '../../../middlewares/auth.middleware.js';
import { ProjectEnvironment } from '../../../types/control-plane.js';

const CreateKeySchema = z.object({
  name: z.string().min(1).max(100),
  environment: z.enum(['development', 'production'] as const).optional(),
  scopes: z.array(z.string()).optional(),
});

export const apiKeyRoutes: FastifyPluginAsync<{
  apiKeyService?: ApiKeyService;
  authManagerService?: AuthManagerService;
}> = async (fastify, opts) => {
  const apiKeyService = opts.apiKeyService ?? new ApiKeyService();
  const authManagerService = opts.authManagerService ?? new AuthManagerService();
  const requireAuth = createAuthHook(authManagerService);

  fastify.addHook('preHandler', requireAuth);

  // 1. List API keys for project
  fastify.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/keys',
    async (request, reply) => {
      const { projectId } = request.params;
      const userId = request.user!.userId;
      const keys = await apiKeyService.listApiKeys(projectId, userId);
      return reply.send({ data: { apiKeys: keys } });
    },
  );

  // 2. Generate new API key (Reveals raw secret only once!)
  fastify.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/keys',
    async (request, reply) => {
      const { projectId } = request.params;
      const parseResult = CreateKeySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues[0]?.message ?? 'Invalid API key creation payload',
          },
        });
      }

      const userId = request.user!.userId;
      const { apiKey, rawSecretKey } = await apiKeyService.createApiKey({
        projectId,
        name: parseResult.data.name,
        environment: parseResult.data.environment as ProjectEnvironment,
        scopes: parseResult.data.scopes,
        userId,
        ipAddress: request.ip,
      });

      return reply.status(201).send({
        data: {
          apiKey,
          secretKey: rawSecretKey, // ONE-TIME DISPLAY
          warning:
            'Store this secret key securely now. It is cryptographically hashed and cannot be shown again.',
        },
      });
    },
  );

  // 3. Revoke API key
  fastify.post<{ Params: { projectId: string; keyId: string } }>(
    '/projects/:projectId/keys/:keyId/revoke',
    async (request, reply) => {
      const { projectId, keyId } = request.params;
      const userId = request.user!.userId;

      await apiKeyService.revokeApiKey({
        projectId,
        keyId,
        userId,
        ipAddress: request.ip,
      });

      return reply.send({ data: { success: true } });
    },
  );
};
