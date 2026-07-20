import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { buildContainer } from '../../../src/infrastructure/container.js';
import { AlgorithmService } from '../../../src/application/service/algorithm.service.js';
import { PipelineService } from '../../../src/application/service/pipeline.service.js';
import { MimeService } from '../../../src/application/service/mime.service.js';
import { CommandGateway } from '../../../src/application/command.gateway.js';
import { HashHandlers } from '../../../src/application/handler/hash.handler.js';
import { CalculateHash } from '../../../src/application/command/hash.command.js';
import { CryptoHasher } from '../../../src/infrastructure/hasher/cryptoHasher.js';
import { SubserviceClient } from '../../../src/infrastructure/subservice/subserviceClient.js';
import { AssetStore } from '../../../src/infrastructure/subservice/assetStore.js';
import { FileTypeMimeDetector } from '../../../src/infrastructure/mime/fileTypeMimeDetector.js';
import type { Config } from '../../../src/infrastructure/config/types.js';
import { makeEnv } from '../../helpers/env.js';

const CONFIG: Config = {
  mime_to_group: { '*': 'binary' },
  algorithms: { sha256: { kind: 'native', comparison: 'exact' } },
  extractors: {},
  subservices: {},
  pipelines: { binary: { sha256: { algorithm: 'sha256' } } },
};

const ENV = makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' });

describe('buildContainer', () => {
  it.each([
    ['hasher', CryptoHasher],
    ['subserviceClient', SubserviceClient],
    ['assetStore', AssetStore],
    ['mimeDetector', FileTypeMimeDetector],
    ['algorithmService', AlgorithmService],
    ['mimeService', MimeService],
    ['pipelineService', PipelineService],
    ['commandGateway', CommandGateway],
    ['hashHandlers', HashHandlers],
  ] as const)('resolves cradle.%s to the expected concrete class', (key, expectedClass) => {
    const { container } = buildContainer(ENV, CONFIG);

    expect(container.cradle[key]).toBeInstanceOf(expectedClass);
  });

  it('passes through the exact config and env values, and provides a logger', () => {
    const { container } = buildContainer(ENV, CONFIG);
    const cradle = container.cradle;

    expect(cradle.config).toBe(CONFIG);
    expect(cradle.env).toBe(ENV);
    expect(cradle.logger).toBeDefined();
  });

  it('wires a pipelineService that can actually compute a hash end to end', async () => {
    const { container } = buildContainer(ENV, CONFIG);

    const result = await container.cradle.pipelineService.process({
      mimeGroup: 'binary',
      buffer: Buffer.from('hello world'),
      recipes: null,
    });

    const expectedHash = createHash('sha256').update('hello world').digest('hex');
    expect(result.results).toEqual([{ recipe: 'binary.sha256', hashes: [expectedHash] }]);
  });

  it('registers CalculateHash on the commandGateway and can dispatch it end to end', async () => {
    const { container } = buildContainer(ENV, CONFIG);

    // An extension the "mime" package doesn't know falls straight through to the "*" group —
    // deterministic without depending on real content-sniffing behavior.
    const result = await container.cradle.commandGateway.dispatch(
      new CalculateHash(Buffer.from('hello world'), { type: 'extension', value: 'not-a-real-extension' }, null),
    );

    const expectedHash = createHash('sha256').update('hello world').digest('hex');
    expect(result.results).toEqual([{ recipe: 'binary.sha256', hashes: [expectedHash] }]);
  });

  it.each(['hasher', 'subserviceClient', 'logger', 'commandGateway'] as const)(
    'returns a singleton for cradle.%s — the same instance is resolved on repeated cradle access',
    (key) => {
      const { container } = buildContainer(ENV, CONFIG);

      expect(container.cradle[key]).toBe(container.cradle[key]);
    },
  );

  it('cleanup closes the subservice client without throwing', async () => {
    const { container, cleanup } = buildContainer(ENV, CONFIG);
    const closeSpy = vi.spyOn(container.cradle.subserviceClient, 'close');

    await expect(cleanup()).resolves.toBeUndefined();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
