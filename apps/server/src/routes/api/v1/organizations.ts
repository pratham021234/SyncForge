import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { OrganizationService } from '../../../services/organization.service.js';
import { AuthManagerService } from '../../../services/auth-manager.service.js';
import { createAuthHook } from '../../../middlewares/auth.middleware.js';
import { OrganizationRole } from '../../../types/control-plane.js';

const CreateOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(50).optional(),
});

const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(100),
});

const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer'] as const),
});

export const organizationRoutes: FastifyPluginAsync<{
  orgService?: OrganizationService;
  authManagerService?: AuthManagerService;
}> = async (fastify, opts) => {
  const orgService = opts.orgService ?? new OrganizationService();
  const authManagerService = opts.authManagerService ?? new AuthManagerService();
  const requireAuth = createAuthHook(authManagerService);

  fastify.addHook('preHandler', requireAuth);

  // 1. List user's organizations
  fastify.get('/organizations', async (request, reply) => {
    const userId = request.user!.userId;
    const orgs = await orgService.getUserOrganizations(userId);
    return reply.send({ data: { organizations: orgs } });
  });

  // 2. Create organization
  fastify.post('/organizations', async (request, reply) => {
    const parseResult = CreateOrgSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0]?.message ?? 'Invalid organization payload',
        },
      });
    }

    const userId = request.user!.userId;
    const org = await orgService.createOrganization({
      name: parseResult.data.name,
      slug: parseResult.data.slug,
      userId,
      ipAddress: request.ip,
    });

    return reply.status(201).send({ data: { organization: org } });
  });

  // 3. Get organization details
  fastify.get<{ Params: { orgId: string } }>('/organizations/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    const userId = request.user!.userId;
    const org = await orgService.getOrganization(orgId, userId);
    return reply.send({ data: { organization: org } });
  });

  // 4. Update organization
  fastify.patch<{ Params: { orgId: string } }>('/organizations/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    const parseResult = UpdateOrgSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0]?.message ?? 'Invalid payload',
        },
      });
    }

    const userId = request.user!.userId;
    const org = await orgService.updateOrganization({
      organizationId: orgId,
      name: parseResult.data.name,
      userId,
      ipAddress: request.ip,
    });

    return reply.send({ data: { organization: org } });
  });

  // 5. List organization members
  fastify.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/members',
    async (request, reply) => {
      const { orgId } = request.params;
      const userId = request.user!.userId;
      const members = await orgService.listMembers(orgId, userId);
      return reply.send({ data: { members } });
    },
  );

  // 6. Invite / Add member
  fastify.post<{ Params: { orgId: string } }>(
    '/organizations/:orgId/members',
    async (request, reply) => {
      const { orgId } = request.params;
      const parseResult = AddMemberSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues[0]?.message ?? 'Invalid member payload',
          },
        });
      }

      const actorUserId = request.user!.userId;
      const member = await orgService.addMember({
        organizationId: orgId,
        email: parseResult.data.email,
        role: parseResult.data.role as OrganizationRole,
        actorUserId,
        ipAddress: request.ip,
      });

      return reply.status(201).send({ data: { member } });
    },
  );

  // 7. Remove member
  fastify.delete<{ Params: { orgId: string; userId: string } }>(
    '/organizations/:orgId/members/:userId',
    async (request, reply) => {
      const { orgId, userId: targetUserId } = request.params;
      const actorUserId = request.user!.userId;

      await orgService.removeMember({
        organizationId: orgId,
        targetUserId,
        actorUserId,
        ipAddress: request.ip,
      });

      return reply.send({ data: { success: true } });
    },
  );

  // 8. Organization Audit Logs
  fastify.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/audit-logs',
    async (request, reply) => {
      const { orgId } = request.params;
      const userId = request.user!.userId;
      const logs = await orgService.listAuditLogs(orgId, userId);
      return reply.send({ data: { auditLogs: logs } });
    },
  );
};
