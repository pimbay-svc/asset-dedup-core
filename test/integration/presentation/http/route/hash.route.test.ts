import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHashRoute } from '../../../../../src/presentation/http/route/hash.route.js';
import { CalculateHash } from '../../../../../src/application/command/hash.command.js';
import type { Cradle } from '../../../../../src/infrastructure/container.js';
import { fakeCradle } from '../../../../helpers/cradle.js';
import {
  InvalidFileContentError,
  UnknownRecipeError,
  MimeMismatchError,
  AssetStorageError,
  SubserviceUnavailableError,
  PipelineExecutionError,
} from '../../../../../src/domain/errors.js';

interface ErrorBody {
  error: string;
  message?: string;
}

function errorBody(response: { json: () => unknown }): ErrorBody {
  return response.json() as ErrorBody;
}

function buildApp(dispatch: ReturnType<typeof vi.fn>): FastifyInstance {
  const app = Fastify({ logger: false });
  const cradle = fakeCradle({ commandGateway: { dispatch } as unknown as Cradle['commandGateway'] });

  registerHashRoute(app, cradle);

  return app;
}

describe('POST /hash', () => {
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatch = vi.fn();
  });

  it('returns 200 with the pipeline results', async () => {
    dispatch.mockResolvedValue({ results: [{ recipe: 'binary.sha256', hashes: ['abc123'] }] });
    const app = buildApp(dispatch);

    const response = await app.inject({
      method: 'POST',
      url: '/hash',
      payload: {
        mime_hint: { type: 'mime', value: 'application/octet-stream' },
        file_content: 'ZmFrZQ==',
        recipes: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ results: [{ recipe: 'binary.sha256', hashes: ['abc123'] }] });
    expect(dispatch).toHaveBeenCalledWith(
      new CalculateHash(Buffer.from('ZmFrZQ==', 'base64'), { type: 'mime', value: 'application/octet-stream' }, null),
    );
  });

  it('returns a vectors result untouched', async () => {
    dispatch.mockResolvedValue({ results: [{ recipe: 'video.clip', vectors: [[1, 2, 3]] }] });
    const app = buildApp(dispatch);

    const response = await app.inject({
      method: 'POST',
      url: '/hash',
      payload: { mime_hint: { type: 'mime', value: 'video/mp4' }, file_content: 'ZmFrZQ==', recipes: null },
    });

    expect(response.json()).toEqual({ results: [{ recipe: 'video.clip', vectors: [[1, 2, 3]] }] });
  });

  it('accepts an "extension" mime_hint (the CLI\'s shape) just as well', async () => {
    dispatch.mockResolvedValue({ results: [{ recipe: 'image.sha256', hashes: ['abc123'] }] });
    const app = buildApp(dispatch);

    const response = await app.inject({
      method: 'POST',
      url: '/hash',
      payload: { mime_hint: { type: 'extension', value: 'jpg' }, file_content: 'ZmFrZQ==', recipes: null },
    });

    expect(response.statusCode).toBe(200);
    expect(dispatch).toHaveBeenCalledWith(
      new CalculateHash(Buffer.from('ZmFrZQ==', 'base64'), { type: 'extension', value: 'jpg' }, null),
    );
  });

  it.each([
    ['mime_hint is missing', { file_content: 'ZmFrZQ==', recipes: null }, /mime_hint/],
    [
      'mime_hint.type is not "mime" or "extension"',
      { mime_hint: { type: 'guess', value: 'image/jpeg' }, file_content: 'ZmFrZQ==', recipes: null },
      undefined,
    ],
    [
      'mime_hint.value is an empty string',
      { mime_hint: { type: 'mime', value: '' }, file_content: 'ZmFrZQ==', recipes: null },
      undefined,
    ],
    ['mime_hint.value is missing', { mime_hint: { type: 'mime' }, file_content: 'ZmFrZQ==', recipes: null }, undefined],
    ['file_content is missing', { mime_hint: { type: 'mime', value: 'image/jpeg' }, recipes: null }, /file_content/],
    ['recipes is missing', { mime_hint: { type: 'mime', value: 'image/jpeg' }, file_content: 'ZmFrZQ==' }, /recipes/],
    [
      'recipes is an object (not coercible to array or null)',
      { mime_hint: { type: 'mime', value: 'image/jpeg' }, file_content: 'ZmFrZQ==', recipes: {} },
      undefined,
    ],
  ])('returns 400 when %s', async (_name, payload, messagePattern) => {
    const app = buildApp(dispatch);

    const response = await app.inject({ method: 'POST', url: '/hash', payload });

    expect(response.statusCode).toBe(400);
    if (messagePattern) {
      expect(errorBody(response).message).toMatch(messagePattern);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-empty file_content that is not valid base64 (real decodeFileContent path, not mocked)', async () => {
    const app = buildApp(dispatch);

    const response = await app.inject({
      method: 'POST',
      url: '/hash',
      payload: { mime_hint: { type: 'mime', value: 'image/jpeg' }, file_content: 'not-valid-base64!!', recipes: null },
    });

    expect(response.statusCode).toBe(400);
    expect(errorBody(response).error).toMatch(/is not valid base64/);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('passes a non-null recipes array through to the dispatched command unchanged', async () => {
    dispatch.mockResolvedValue({ results: [{ recipe: 'image.sha256', hashes: ['abc123'] }] });
    const app = buildApp(dispatch);

    await app.inject({
      method: 'POST',
      url: '/hash',
      payload: {
        mime_hint: { type: 'mime', value: 'image/jpeg' },
        file_content: 'ZmFrZQ==',
        recipes: ['image.sha256'],
      },
    });

    expect(dispatch).toHaveBeenCalledWith(
      new CalculateHash(Buffer.from('ZmFrZQ==', 'base64'), { type: 'mime', value: 'image/jpeg' }, ['image.sha256']),
    );
  });

  it.each([
    [
      'maps InvalidFileContentError to 400',
      InvalidFileContentError.notValidBase64(),
      400,
      'file_content is not valid base64',
    ],
    [
      'maps UnknownRecipeError to 400',
      UnknownRecipeError.unknownRecipe('image.nope'),
      400,
      'unknown recipe "image.nope"',
    ],
    [
      'maps MimeMismatchError to 400',
      MimeMismatchError.contentMismatch('image/jpeg', 'application/x-msdownload'),
      400,
      /does not match/,
    ],
    [
      'maps PipelineExecutionError without a subservice-unavailable cause to 422',
      PipelineExecutionError.recipeNotConfigured('image.phash'),
      422,
      'recipe "image.phash" is not configured',
    ],
    [
      'maps PipelineExecutionError wrapping a SubserviceUnavailableError to 502',
      PipelineExecutionError.stepFailed('image.phash', SubserviceUnavailableError.clientClosed('image-hash')),
      502,
      undefined,
    ],
    [
      'maps SubserviceUnavailableError to 502',
      SubserviceUnavailableError.clientClosed('image-hash'),
      502,
      'subservice "image-hash" client closed',
    ],
    ['maps AssetStorageError to 500', AssetStorageError.persistFailed(new Error('disk full')), 500, 'internal error'],
    ['maps any other error to 500', new Error('something unrelated broke'), 500, 'internal error'],
  ])('%s', async (_title, rejection, expectedStatus, expectedError) => {
    dispatch.mockRejectedValue(rejection);
    const app = buildApp(dispatch);

    const response = await app.inject({
      method: 'POST',
      url: '/hash',
      payload: { mime_hint: { type: 'mime', value: 'image/jpeg' }, file_content: 'ZmFrZQ==', recipes: null },
    });

    expect(response.statusCode).toBe(expectedStatus);
    if (typeof expectedError === 'string') {
      expect(errorBody(response).error).toBe(expectedError);
    } else if (expectedError instanceof RegExp) {
      expect(errorBody(response).error).toMatch(expectedError);
    }
  });
});
