import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { buildHttpServer } from '../../../../src/presentation/http/server.js';
import { SERVICE_VERSION } from '../../../../src/infrastructure/version.js';
import { AlgorithmService } from '../../../../src/application/service/algorithm.service.js';
import type { Cradle } from '../../../../src/infrastructure/container.js';
import type { Config } from '../../../../src/infrastructure/config/types.js';
import { makeEnv } from '../../../helpers/env.js';
import { fakeCradle } from '../../../helpers/cradle.js';

const CONFIG: Config = {
  mime_to_group: { '*': 'binary' },
  algorithms: { sha256: { kind: 'native', comparison: 'exact' } },
  extractors: {},
  subservices: {},
  pipelines: { binary: { sha256: { algorithm: 'sha256' } } },
};

function buildCradle(dispatch: ReturnType<typeof vi.fn> = vi.fn()): Cradle {
  return fakeCradle({
    env: makeEnv(),
    logger: pino({ level: 'silent' }),
    config: CONFIG,
    algorithmService: new AlgorithmService(),
    commandGateway: { dispatch } as unknown as Cradle['commandGateway'],
    subserviceClient: {
      verifyReachable: vi.fn().mockResolvedValue(true),
    } as unknown as Cradle['subserviceClient'],
  });
}

describe('buildServer', () => {
  it('mounts every route: /hash, /algorithms, /healthz', async () => {
    const app = await buildHttpServer(
      buildCradle(vi.fn().mockResolvedValue({ results: [{ recipe: 'binary.sha256', hashes: ['abc'] }] })),
    );

    const hash = await app.inject({
      method: 'POST',
      url: '/hash',
      payload: {
        mime_hint: { type: 'mime', value: 'application/octet-stream' },
        file_content: 'ZmFrZQ==',
        recipes: null,
      },
    });
    const algorithms = await app.inject({ method: 'GET', url: '/algorithms' });
    const healthz = await app.inject({ method: 'GET', url: '/healthz' });

    expect(hash.statusCode).toBe(200);
    expect(algorithms.statusCode).toBe(200);
    expect(healthz.statusCode).toBe(200);

    await app.close();
  });

  it('serves the swagger UI at /docs', async () => {
    const app = await buildHttpServer(buildCradle());

    const response = await app.inject({ method: 'GET', url: '/docs' });

    expect(response.statusCode).toBeLessThan(400);

    await app.close();
  });

  it('normalizes a schema-validation failure into the documented { error } shape', async () => {
    const app = await buildHttpServer(buildCradle());

    const response = await app.inject({ method: 'POST', url: '/hash', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error');
    expect(Object.keys(response.json())).toEqual(['error']);

    await app.close();
  });

  it('publishes an OpenAPI document with the expected title/version and a documented response schema for /algorithms', async () => {
    const app = await buildHttpServer(buildCradle());
    await app.ready();

    const openapi = app.swagger() as {
      info: { title: string; version: string };
      paths: Record<
        string,
        {
          get?: { responses?: Record<string, { content?: unknown }> };
          post?: { responses?: Record<string, { content?: unknown }> };
        }
      >;
    };

    expect(openapi.info).toEqual({ title: 'asset-dedup-core', version: SERVICE_VERSION });
    // A route registered without an explicit `schema.response` still gets an auto-generated
    // "200: Default Response" entry from @fastify/swagger, so presence of "200" alone doesn't
    // prove the route declared its own schema — presence of "content" does.
    expect(openapi.paths['/algorithms']?.get?.responses?.['200']).toHaveProperty('content');
    expect(openapi.paths['/hash']?.post?.responses?.['200']).toHaveProperty('content');

    await app.close();
  });

  it('falls through to a generic 500 for a non-validation server error (e.g. malformed JSON body)', async () => {
    const errorSpy = vi.fn();
    const fakeLoggerInstance = {
      error: errorSpy,
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      level: 'silent',
      child: vi.fn(function (this: unknown) {
        return this;
      }),
    };
    const cradle = buildCradle();
    cradle.logger = fakeLoggerInstance as unknown as Cradle['logger'];
    const app = await buildHttpServer(cradle);

    const response = await app.inject({
      method: 'POST',
      url: '/hash',
      headers: { 'content-type': 'application/json' },
      payload: '{not valid json',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal error' });
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith({ err: expect.any(Error) as Error }, 'unhandled error');

    await app.close();
  });

  it('configures the underlying Fastify server with the intended body limit and forceCloseConnections', async () => {
    const app = await buildHttpServer(buildCradle());
    await app.ready();

    expect(app.initialConfig.bodyLimit).toBe(100 * 1024 * 1024);
    expect(app.initialConfig.forceCloseConnections).toBe(true);

    await app.close();
  });
});
