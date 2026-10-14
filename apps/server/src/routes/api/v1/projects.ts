import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ProjectService } from '../../../services/project.service.js';
import { AuthManagerService } from '../../../services/auth-manager.service.js';
import { createAuthHook } from '../../../middlewares/auth.middleware.js';
import { ProjectEnvironment, ProjectPlan } from '../../../types/control-plane.js';

const CreateProjectSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(50).optional(),
  environment: z.enum(['development', 'production'] as const).optional(),
  plan: z.enum(['free', 'pro', 'enterprise'] as const).optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  environment: z.enum(['development', 'production'] as const).optional(),
  plan: z.enum(['free', 'pro', 'enterprise'] as const).optional(),
  settings: z
    .object({
      maxConnections: z.number().int().positive().optional(),
      maxMessageSizeBytes: z.number().int().positive().optional(),
      allowedOrigins: z.array(z.string()).optional(),
    })
    .optional(),
});

const DeleteProjectSchema = z.object({
  confirmSlug: z.string().min(1),
});

export const projectRoutes: FastifyPluginAsync<{
  projectService?: ProjectService;
  authManagerService?: AuthManagerService;
}> = async (fastify, opts) => {
  const projectService = opts.projectService ?? new ProjectService();
  const authManagerService = opts.authManagerService ?? new AuthManagerService();
  const requireAuth = createAuthHook(authManagerService);

  fastify.addHook('preHandler', requireAuth);

  // 1. List projects in organization
  fastify.get<{ Querystring: { organizationId: string } }>('/projects', async (request, reply) => {
    const { organizationId } = request.query;
    if (!organizationId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required organizationId query parameter',
        },
      });
    }

    const userId = request.user!.userId;
    const projects = await projectService.listProjects(organizationId, userId);
    return reply.send({ data: { projects } });
  });

  // 2. Create project
  fastify.post('/projects', async (request, reply) => {
    const parseResult = CreateProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0]?.message ?? 'Invalid project creation payload',
        },
      });
    }

    const userId = request.user!.userId;
    const { project, initialApiKey } = await projectService.createProject({
      organizationId: parseResult.data.organizationId,
      name: parseResult.data.name,
      slug: parseResult.data.slug,
      environment: parseResult.data.environment as ProjectEnvironment,
      plan: parseResult.data.plan as ProjectPlan,
      userId,
      ipAddress: request.ip,
    });

    return reply.status(201).send({
      data: {
        project,
        initialApiKey,
      },
    });
  });

  // 3. Get project details
  fastify.get<{ Params: { projectId: string } }>('/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.user!.userId;
    const project = await projectService.getProject(projectId, userId);
    return reply.send({ data: { project } });
  });

  // 4. Update project
  fastify.patch<{ Params: { projectId: string } }>(
    '/projects/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;
      const parseResult = UpdateProjectSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues[0]?.message ?? 'Invalid project update payload',
          },
        });
      }

      const userId = request.user!.userId;
      const project = await projectService.updateProject({
        projectId,
        name: parseResult.data.name,
        environment: parseResult.data.environment as ProjectEnvironment,
        plan: parseResult.data.plan as ProjectPlan,
        settings: parseResult.data.settings,
        userId,
        ipAddress: request.ip,
      });

      return reply.send({ data: { project } });
    },
  );

  // 5. Delete project
  fastify.delete<{ Params: { projectId: string } }>(
    '/projects/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;
      const parseResult = DeleteProjectSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Please confirm deletion by providing the exact project slug in confirmSlug',
          },
        });
      }

      const userId = request.user!.userId;
      await projectService.deleteProject({
        projectId,
        confirmSlug: parseResult.data.confirmSlug,
        userId,
        ipAddress: request.ip,
      });

      return reply.send({ data: { success: true } });
    },
  );

  // 6. Project Audit Logs
  fastify.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/audit-logs',
    async (request, reply) => {
      const { projectId } = request.params;
      const userId = request.user!.userId;
      const logs = await projectService.listAuditLogs(projectId, userId);
      return reply.send({ data: { auditLogs: logs } });
    },
  );
};
