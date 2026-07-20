/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { FastifyInstance } from 'fastify';
import type { Cradle } from '../../../infrastructure/container.js';

interface HealthzQuery {
  deep?: string;
}

interface SubserviceCheckResult {
  subservice: string;
  reachable: boolean;
}

export function registerHealthzRoute(app: FastifyInstance, cradle: Cradle): void {
  app.get<{ Querystring: HealthzQuery }>('/healthz', async (request, reply) => {
    if (request.query.deep !== 'true') {
      return reply.status(200).send({ status: 'ok' });
    }

    const subserviceNames = Object.keys(cradle.config.subservices);

    const checks: SubserviceCheckResult[] = await Promise.all(
      subserviceNames.map(async (subservice) => ({
        subservice,
        reachable: await cradle.subserviceClient.verifyReachable(subservice),
      })),
    );

    const allReachable = checks.every((check) => check.reachable);

    return reply.status(allReachable ? 200 : 503).send({
      status: allReachable ? 'ok' : 'degraded',
      subservices: checks,
    });
  });
}
