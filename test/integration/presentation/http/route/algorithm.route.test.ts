import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAlgorithmsRoute } from '../../../../../src/presentation/http/route/algorithm.route.js';
import { AlgorithmService } from '../../../../../src/application/service/algorithm.service.js';
import type { Config } from '../../../../../src/infrastructure/config/types.js';
import { fakeCradle } from '../../../../helpers/cradle.js';

const CONFIG: Config = {
  mime_to_group: { 'image/jpeg': 'image', '*': 'binary' },
  algorithms: {
    sha256: { kind: 'native', comparison: 'exact' },
    phash: { kind: 'subservice', subservice: 'image-hash', comparison: 'hamming', config: {} },
  },
  extractors: {},
  subservices: { 'image-hash': { socket_path: '/var/run/image-hash.sock' } },
  pipelines: {
    binary: { sha256: { algorithm: 'sha256' } },
    image: { sha256: { algorithm: 'sha256' }, phash: { algorithm: 'phash' } },
  },
};

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  const cradle = fakeCradle({ config: CONFIG, algorithmService: new AlgorithmService() });

  registerAlgorithmsRoute(app, cradle);

  return app;
}

describe('GET /algorithms', () => {
  it('returns the derived recipe/comparison list, in pipeline order', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/algorithms' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      algorithms: [
        { recipe: 'binary.sha256', comparison: 'exact' },
        { recipe: 'image.sha256', comparison: 'exact' },
        { recipe: 'image.phash', comparison: 'hamming' },
      ],
    });
  });
});
