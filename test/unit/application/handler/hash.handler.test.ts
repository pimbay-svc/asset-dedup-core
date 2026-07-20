import { describe, it, expect, vi } from 'vitest';
import { HashHandlers } from '../../../../src/application/handler/hash.handler.js';
import { CalculateHash, type CalculateHashResult } from '../../../../src/application/command/hash.command.js';
import type { MimeService } from '../../../../src/application/service/mime.service.js';
import type { PipelineService } from '../../../../src/application/service/pipeline.service.js';

describe('HashHandlers.calculate', () => {
  it('resolves the mime hint, then runs the pipeline against the resolved mimeGroup', async () => {
    const resolve = vi.fn(() => Promise.resolve({ mime: 'image/jpeg', mimeGroup: 'image' }));
    const process = vi.fn(() => Promise.resolve({ results: [{ recipe: 'image.sha256', hashes: ['abc'] }] }));
    const mimeService = { resolve } as unknown as MimeService;
    const pipelineService = { process } as unknown as PipelineService;
    const handler = new HashHandlers(mimeService, pipelineService);

    const buffer = Buffer.from('img');
    const command = new CalculateHash(buffer, { type: 'mime', value: 'image/jpeg' }, ['image.sha256']);
    const result = await handler.calculate(command);

    expect(resolve).toHaveBeenCalledWith({ type: 'mime', value: 'image/jpeg' }, buffer);
    expect(process).toHaveBeenCalledWith({ mimeGroup: 'image', buffer, recipes: ['image.sha256'] });
    expect(result).toEqual({ results: [{ recipe: 'image.sha256', hashes: ['abc'] }] });
  });
});

describe('HashHandlers.asHandlers', () => {
  it('exposes CalculateHash bound to the instance method', async () => {
    const resolve = vi.fn(() => Promise.resolve({ mime: 'image/jpeg', mimeGroup: 'image' }));
    const process = vi.fn(() => Promise.resolve({ results: [] }));
    const mimeService = { resolve } as unknown as MimeService;
    const pipelineService = { process } as unknown as PipelineService;
    const handler = new HashHandlers(mimeService, pipelineService);

    const [entry] = handler.asHandlers();

    expect(entry?.commandClass).toBe(CalculateHash);

    const command = new CalculateHash(Buffer.from('x'), { type: 'mime', value: 'image/jpeg' }, null);
    const result = (await entry?.execute(command)) as CalculateHashResult;
    expect(result).toEqual({ results: [] });
  });
});
