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
import { sendErrorResponse } from '../errorResponse.js';
import { CalculateHash } from '../../../application/command/hash.command.js';
import type { MimeHint } from '../../../application/service/mime.service.js';
import { InvalidFileContentError } from '../../../domain/errors.js';
import { hashRequestBodySchema, hashResponseSchema } from './schema/hash.schema.js';

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

interface HashRequestBody {
  mime_hint: MimeHint;
  file_content: string;
  recipes: string[] | null;
}

/**
 * Base64 decoding is an HTTP wire-format concern only — the CLI reads a file's bytes directly
 * and never goes through this. Kept local to this route rather than in the application layer.
 */
export function decodeFileContent(fileContent: string): Buffer {
  if (fileContent.length === 0) {
    throw InvalidFileContentError.empty();
  }
  if (!BASE64_PATTERN.test(fileContent) || fileContent.length % 4 !== 0) {
    throw InvalidFileContentError.notValidBase64();
  }

  return Buffer.from(fileContent, 'base64');
}

export function registerHashRoute(app: FastifyInstance, cradle: Cradle): void {
  app.post<{ Body: HashRequestBody }>(
    '/hash',
    {
      schema: {
        body: hashRequestBodySchema,
        response: { 200: hashResponseSchema },
      },
    },
    async (request, reply) => {
      const { mime_hint: mimeHint, file_content: fileContent, recipes } = request.body;

      try {
        const fileBuffer = decodeFileContent(fileContent);
        const { results } = await cradle.commandGateway.dispatch(new CalculateHash(fileBuffer, mimeHint, recipes));

        return await reply.status(200).send({ results });
      } catch (err) {
        return sendErrorResponse(request, reply, err);
      }
    },
  );
}
