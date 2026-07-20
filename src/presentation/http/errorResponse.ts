/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  InvalidFileContentError,
  UnknownRecipeError,
  MimeMismatchError,
  AssetStorageError,
  SubserviceUnavailableError,
  PipelineExecutionError,
} from '../../domain/errors.js';
import { HttpServerMessage } from './messages.js';

export function sendErrorResponse(request: FastifyRequest, reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof InvalidFileContentError || err instanceof UnknownRecipeError || err instanceof MimeMismatchError) {
    return reply.status(400).send({ error: err.message });
  }
  if (err instanceof PipelineExecutionError) {
    const status = err.cause instanceof SubserviceUnavailableError ? 502 : 422;

    return reply.status(status).send({ error: err.message });
  }
  if (err instanceof SubserviceUnavailableError) {
    return reply.status(502).send({ error: err.message });
  }
  if (err instanceof AssetStorageError) {
    request.log.error({ err }, HttpServerMessage.ASSET_STORAGE_FAILURE);

    return reply.status(500).send({ error: HttpServerMessage.INTERNAL_ERROR });
  }

  request.log.error({ err }, HttpServerMessage.UNEXPECTED_ERROR);

  return reply.status(500).send({ error: HttpServerMessage.INTERNAL_ERROR });
}
