import fastify, { FastifyError, FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import crypto from 'crypto';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { infoRoutes } from './routes/api/v1/info.js';
import { AppError } from './errors/app-error.js';

export interface BuildAppOptions {
  fastifyOptions?: FastifyServerOptions;
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

  // CORS configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. mobile apps, curl, same-origin)
      if (!origin) {
        return cb(null, true);
      }
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
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

  return app;
}
