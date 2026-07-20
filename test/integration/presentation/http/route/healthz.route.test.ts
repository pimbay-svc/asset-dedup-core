import { describe, it, expect, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthzRoute } from '../../../../../src/presentation/http/route/healthz.route.js';
import type { Cradle } from '../../../../../src/infrastructure/container.js';
import type { Config } from '../../../../../src/infrastructure/config/types.js';
import { fakeCradle } from '../../../../helpers/cradle.js';

interface HealthzBody {
  status: string;
  subservices?: { subservice: string; reachable: boolean }[];
}

function healthzBody(response: { json: () => unknown }): HealthzBody {
  return response.json() as HealthzBody;
}

function buildApp(config: Config, verifyReachable: ReturnType<typeof vi.fn>): FastifyInstance {
  const app = Fastify({ logger: false });
  const cradle = fakeCradle({
    config,
    subserviceClient: { verifyReachable } as unknown as Cradle['subserviceClient'],
  });

  registerHealthzRoute(app, cradle);

  return app;
}

const NO_SUBSERVICES_CONFIG: Config = {
  mime_to_group: { '*': 'binary' },
  algorithms: { sha256: { kind: 'native', comparison: 'exact' } },
  extractors: {},
  subservices: {},
  pipelines: { binary: { sha256: { algorithm: 'sha256' } } },
};

function subserviceConfig(): Config {
  return {
    mime_to_group: { 'image/jpeg': 'image', '*': 'binary' },
    algorithms: {
      sha256: { kind: 'native', comparison: 'exact' },
      phash: { kind: 'subservice', subservice: 'image-hash', comparison: 'hamming', config: {} },
    },
    extractors: {},
    subservices: { 'image-hash': { socket_path: '/var/run/image-hash.sock' } },
    pipelines: { binary: { sha256: { algorithm: 'sha256' } }, image: { phash: { algorithm: 'phash' } } },
  };
}

describe('GET /healthz', () => {
  it.each([
    ['a shallow check without ?deep', '/healthz', { status: 'ok' }],
    ['any non-"true" ?deep value, treated as a shallow check', '/healthz?deep=false', { status: 'ok' }],
    ['a deep check with no subservices configured', '/healthz?deep=true', { status: 'ok', subservices: [] }],
  ])('returns 200 ok for %s', async (_name, url, expectedBody) => {
    const app = buildApp(NO_SUBSERVICES_CONFIG, vi.fn());

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedBody);
  });

  it.each([
    ['reachable', true, 200, 'ok'],
    ['unreachable', false, 503, 'degraded'],
  ])(
    'reports a subservice as %s when verifyReachable resolves %s',
    async (_name, resolvedValue, expectedStatus, expectedHealthStatus) => {
      const verifyReachable = vi.fn().mockResolvedValue(resolvedValue);
      const app = buildApp(subserviceConfig(), verifyReachable);

      const response = await app.inject({ method: 'GET', url: '/healthz?deep=true' });

      expect(response.statusCode).toBe(expectedStatus);
      expect(healthzBody(response).status).toBe(expectedHealthStatus);
      expect(healthzBody(response).subservices).toEqual([{ subservice: 'image-hash', reachable: resolvedValue }]);
      expect(verifyReachable).toHaveBeenCalledWith('image-hash');
    },
  );
});
