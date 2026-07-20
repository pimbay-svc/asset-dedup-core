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
import { algorithmsResponseSchema } from './schema/algorithm.schema.js';

export function registerAlgorithmsRoute(app: FastifyInstance, cradle: Cradle): void {
  app.get('/algorithms', { schema: { response: { 200: algorithmsResponseSchema } } }, async (_request, reply) => {
    const algorithms = cradle.algorithmService.deriveAlgorithms(cradle.config);

    return reply.status(200).send({ algorithms });
  });
}
