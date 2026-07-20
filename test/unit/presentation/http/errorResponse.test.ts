import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendErrorResponse } from '../../../../src/presentation/http/errorResponse.js';
import {
  InvalidFileContentError,
  UnknownRecipeError,
  MimeMismatchError,
  AssetStorageError,
  SubserviceUnavailableError,
  PipelineExecutionError,
} from '../../../../src/domain/errors.js';

function makeReply(): {
  reply: FastifyReply;
  statusMock: ReturnType<typeof vi.fn>;
  sendMock: ReturnType<typeof vi.fn>;
} {
  const reply = {} as FastifyReply;
  const statusMock = vi.fn(() => reply);
  const sendMock = vi.fn(() => reply);
  reply.status = statusMock;
  reply.send = sendMock;

  return { reply, statusMock, sendMock };
}

function makeRequest(): { request: FastifyRequest; errorMock: ReturnType<typeof vi.fn> } {
  const errorMock = vi.fn();
  const request = { log: { error: errorMock } } as unknown as FastifyRequest;

  return { request, errorMock };
}

describe('sendErrorResponse', () => {
  it.each([
    ['InvalidFileContentError', InvalidFileContentError.notValidBase64()],
    ['UnknownRecipeError', UnknownRecipeError.unknownRecipe('image.nope')],
    ['MimeMismatchError', MimeMismatchError.contentMismatch('image/jpeg', 'application/x-msdownload')],
  ])('maps %s to 400 with the error message', (_name, err) => {
    const { request } = makeRequest();
    const { reply, statusMock, sendMock } = makeReply();

    sendErrorResponse(request, reply, err);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(sendMock).toHaveBeenCalledWith({ error: err.message });
  });

  it('maps PipelineExecutionError caused by SubserviceUnavailableError to 502', () => {
    const { request } = makeRequest();
    const { reply, statusMock, sendMock } = makeReply();
    const err = PipelineExecutionError.stepFailed('recipe', SubserviceUnavailableError.clientClosed('image-hash'));

    sendErrorResponse(request, reply, err);

    expect(statusMock).toHaveBeenCalledWith(502);
    expect(sendMock).toHaveBeenCalledWith({ error: err.message });
  });

  it('maps PipelineExecutionError with any other (or no) cause to 422', () => {
    const { request } = makeRequest();
    const { reply, statusMock, sendMock } = makeReply();
    const err = PipelineExecutionError.recipeNotConfigured('recipe');

    sendErrorResponse(request, reply, err);

    expect(statusMock).toHaveBeenCalledWith(422);
    expect(sendMock).toHaveBeenCalledWith({ error: err.message });
  });

  it('maps SubserviceUnavailableError to 502 with the error message', () => {
    const { request } = makeRequest();
    const { reply, statusMock, sendMock } = makeReply();
    const err = SubserviceUnavailableError.clientClosed('image-hash');

    sendErrorResponse(request, reply, err);

    expect(statusMock).toHaveBeenCalledWith(502);
    expect(sendMock).toHaveBeenCalledWith({ error: err.message });
  });

  it.each([
    [
      'maps AssetStorageError to a generic 500, logging it distinctly as "asset storage failure"',
      AssetStorageError.persistFailed(new Error('disk full')),
      'asset storage failure',
    ],
    [
      'maps any other error to a generic 500, logging it distinctly as "unexpected error"',
      new Error('something unrelated broke'),
      'unexpected error',
    ],
  ])('%s', (_title, err, logMessage) => {
    const { request, errorMock } = makeRequest();
    const { reply, statusMock, sendMock } = makeReply();

    sendErrorResponse(request, reply, err);

    expect(errorMock).toHaveBeenCalledExactlyOnceWith({ err }, logMessage);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(sendMock).toHaveBeenCalledWith({ error: 'internal error' });
  });
});
