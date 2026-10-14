import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthManagerService } from '../../../services/auth-manager.service.js';
import { createAuthHook } from '../../../middlewares/auth.middleware.js';
import { env } from '../../../config/env.js';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

const PasswordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const authRoutes: FastifyPluginAsync<{ authManagerService?: AuthManagerService }> = async (
  fastify,
  opts,
) => {
  const authManagerService = opts.authManagerService ?? new AuthManagerService();
  const requireAuth = createAuthHook(authManagerService);
  const isProduction = env.NODE_ENV === 'production';

  // 1. Account Registration
  fastify.post('/auth/register', async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0]?.message ?? 'Invalid registration payload',
        },
      });
    }

    const { email, password, name } = parseResult.data;
    const ipAddress = request.ip;

    const result = await authManagerService.register({
      email,
      password,
      name,
      ipAddress,
    });

    // Set secure HttpOnly cookie
    reply.header(
      'Set-Cookie',
      `syncforge_session=${result.token}; Path=/; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`,
    );

    return reply.status(201).send({
      data: {
        user: result.user,
        organization: result.organization,
        project: result.project,
        initialApiKey: result.initialApiKey,
        token: result.token,
      },
    });
  });

  // 2. User Login
  fastify.post('/auth/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0]?.message ?? 'Invalid login credentials',
        },
      });
    }

    const { email, password } = parseResult.data;
    const ipAddress = request.ip;

    const result = await authManagerService.login({
      email,
      password,
      ipAddress,
    });

    reply.header(
      'Set-Cookie',
      `syncforge_session=${result.token}; Path=/; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`,
    );

    return reply.send({
      data: {
        user: result.user,
        token: result.token,
      },
    });
  });

  // 3. User Logout
  fastify.post('/auth/logout', async (_request, reply) => {
    reply.header(
      'Set-Cookie',
      `syncforge_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`,
    );
    return reply.send({ data: { success: true } });
  });

  // 4. Current User Profile
  fastify.get('/auth/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const user = await authManagerService.getMe(userId);
    return reply.send({ data: { user } });
  });

  // 5. Password Reset Request
  fastify.post('/auth/password-reset/request', async (request, reply) => {
    const parseResult = PasswordResetRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please provide a valid email address',
        },
      });
    }

    const result = await authManagerService.requestPasswordReset({
      email: parseResult.data.email,
      ipAddress: request.ip,
    });

    return reply.send({ data: result });
  });

  // 6. Password Reset Confirmation
  fastify.post('/auth/password-reset/confirm', async (request, reply) => {
    const parseResult = PasswordResetConfirmSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0]?.message ?? 'Invalid password reset payload',
        },
      });
    }

    const result = await authManagerService.confirmPasswordReset({
      token: parseResult.data.token,
      newPassword: parseResult.data.newPassword,
      ipAddress: request.ip,
    });

    return reply.send({ data: result });
  });
};
