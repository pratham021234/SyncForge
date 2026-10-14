import fastify, { FastifyError, FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import crypto from 'crypto';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { infoRoutes } from './routes/api/v1/info.js';
import { authRoutes } from './routes/api/v1/auth.js';
import { organizationRoutes } from './routes/api/v1/organizations.js';
import { projectRoutes } from './routes/api/v1/projects.js';
import { apiKeyRoutes } from './routes/api/v1/api-keys.js';
import { tokenRoutes } from './routes/api/v1/tokens.js';
import { usageRoutes } from './routes/api/v1/usage.js';
import { AppError } from './errors/app-error.js';
import { RoomManager } from './engine/room-manager.js';
import { PersistenceService } from './services/persistence.service.js';
import { AuthService } from './services/auth.service.js';
import { AuthManagerService } from './services/auth-manager.service.js';
import { OrganizationService } from './services/organization.service.js';
import { ProjectService } from './services/project.service.js';
import { ApiKeyService } from './services/api-key.service.js';
import { UsageService } from './services/usage.service.js';
import { registerCollaborationGateway, WebSocketSession } from './gateway/collaboration.gateway.js';

declare module 'fastify' {
  interface FastifyInstance {
    roomManager: RoomManager;
    persistenceService: PersistenceService;
    authService: AuthService;
    authManagerService: AuthManagerService;
    organizationService: OrganizationService;
    projectService: ProjectService;
    apiKeyService: ApiKeyService;
    usageService: UsageService;
    gateway: {
      sessions: Map<string, WebSocketSession>;
      broadcastShutdown: () => void;
    };
  }
}

export interface BuildAppOptions {
  fastifyOptions?: FastifyServerOptions;
  persistenceService?: PersistenceService;
  roomManager?: RoomManager;
  authService?: AuthService;
  authManagerService?: AuthManagerService;
  organizationService?: OrganizationService;
  projectService?: ProjectService;
  apiKeyService?: ApiKeyService;
  usageService?: UsageService;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const isTest = env.NODE_ENV === 'test';

  const app = fastify({
    logger: isTest
      ? false
      : {
          level: env.LOG_LEVEL,
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'body.password',
            'body.apiKey',
            'body.secretKey',
          ],
        },
    genReqId: (req) => {
      const existingId = req.headers['x-request-id'];
      if (typeof existingId === 'string' && existingId.trim().length > 0) {
        return existingId;
      }
      return crypto.randomUUID();
    },
    bodyLimit: env.REQUEST_BODY_LIMIT_BYTES,
    connectionTimeout: env.REQUEST_TIMEOUT_MS,
    ...options.fastifyOptions,
  });

  // Register WebSocket plugin
  app.register(websocket, {
    options: {
      maxPayload: env.REQUEST_BODY_LIMIT_BYTES,
    },
  });

  // Initialize services
  const persistenceService = options.persistenceService ?? new PersistenceService();
  const roomManager = options.roomManager ?? new RoomManager(persistenceService);
  const apiKeyService = options.apiKeyService ?? new ApiKeyService();
  const authService = options.authService ?? new AuthService(undefined, apiKeyService);
  const authManagerService = options.authManagerService ?? new AuthManagerService();
  const organizationService = options.organizationService ?? new OrganizationService();
  const projectService = options.projectService ?? new ProjectService();
  const usageService = options.usageService ?? new UsageService();

  // Register collaboration WebSocket gateway
  const gateway = registerCollaborationGateway(app, roomManager, authService, {
    usageService,
  });

  // Attach services to Fastify instance
  app.decorate('roomManager', roomManager);
  app.decorate('persistenceService', persistenceService);
  app.decorate('authService', authService);
  app.decorate('authManagerService', authManagerService);
  app.decorate('organizationService', organizationService);
  app.decorate('projectService', projectService);
  app.decorate('apiKeyService', apiKeyService);
  app.decorate('usageService', usageService);
  app.decorate('gateway', gateway);

  // CORS configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. mobile apps, curl, same-origin)
      if (!origin) {
        return cb(null, true);
      }
      if (
        env.NODE_ENV === 'test' ||
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('http://localhost:')
      ) {
        return cb(null, true);
      }
      return cb(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-api-key'],
  });

  // Global custom error handler
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      request.log.warn({ err: error, requestId }, error.message);
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const fastifyErr = error as FastifyError;

    // Fastify validation errors
    if (fastifyErr.validation) {
      request.log.warn(
        { validation: fastifyErr.validation, requestId },
        'Request validation failed',
      );
      return reply.status(400).send({
        error: {
          code: 'INVALID_PAYLOAD',
          message: fastifyErr.message,
          details: { validation: fastifyErr.validation },
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Unhandled / Internal Server Error
    request.log.error({ err: error, requestId }, 'Unhandled internal server error');
    const isProduction = env.NODE_ENV === 'production';
    const statusCode = typeof fastifyErr.statusCode === 'number' ? fastifyErr.statusCode : 500;

    return reply.status(statusCode).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'An unexpected internal error occurred' : error.message,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Custom 404 handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Register routes
  app.register(healthRoutes);
  app.register(infoRoutes, { prefix: '/api/v1' });
  app.register(authRoutes, { prefix: '/api/v1', authManagerService });
  app.register(organizationRoutes, {
    prefix: '/api/v1',
    orgService: organizationService,
    authManagerService,
  });
  app.register(projectRoutes, {
    prefix: '/api/v1',
    projectService,
    authManagerService,
  });
  app.register(apiKeyRoutes, {
    prefix: '/api/v1',
    apiKeyService,
    authManagerService,
  });
  app.register(tokenRoutes, { prefix: '/api/v1', apiKeyService });
  app.register(usageRoutes, {
    prefix: '/api/v1',
    usageService,
    authManagerService,
  });

  return app;
}
