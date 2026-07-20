/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Cradle } from '../../infrastructure/container.js';
import { SERVICE_VERSION } from '../../infrastructure/version.js';
import { registerHashRoute } from './route/hash.route.js';
import { registerAlgorithmsRoute } from './route/algorithm.route.js';
import { registerHealthzRoute } from './route/healthz.route.js';
import { HttpServerMessage } from './messages.js';

// Kept generous on purpose — rejecting a valid large asset is worse than a large buffer.
const BODY_LIMIT_BYTES = 100 * 1024 * 1024;

export async function buildHttpServer(cradle: Cradle): Promise<FastifyInstance> {
  const fastify = Fastify<Server, IncomingMessage, ServerResponse>({
    loggerInstance: cradle.logger,
    bodyLimit: BODY_LIMIT_BYTES,
    forceCloseConnections: true,
  });

  await fastify.register(swagger, {
    openapi: {
      info: { title: 'asset-dedup-core', version: SERVICE_VERSION },
    },
  });
  await fastify.register(swaggerUi, { routePrefix: '/docs' });

  fastify.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation !== undefined) {
      return reply.status(400).send({ error: error.message });
    }

    request.log.error({ err: error }, HttpServerMessage.UNHANDLED_ERROR);

    return reply.status(500).send({ error: HttpServerMessage.INTERNAL_ERROR });
  });

  registerHashRoute(fastify, cradle);
  registerAlgorithmsRoute(fastify, cradle);
  registerHealthzRoute(fastify, cradle);

  return fastify;
}
