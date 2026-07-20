import { describe, it, expect } from 'vitest';
import { AlgorithmService } from '../../../../src/application/service/algorithm.service.js';
import type { Config } from '../../../../src/infrastructure/config/types.js';

const CONFIG: Config = {
  mime_to_group: { 'image/jpeg': 'image', 'video/mp4': 'video', '*': 'binary' },
  algorithms: {
    sha256: { kind: 'native', comparison: 'exact' },
    phash: { kind: 'subservice', subservice: 'image-hash', comparison: 'hamming', config: {} },
    clip: { kind: 'subservice', subservice: 'embedding', comparison: 'cosine', config: {} },
  },
  extractors: {
    'video-frames': { subservice: 'video-frame-extract', config: {} },
  },
  subservices: {
    'image-hash': { socket_path: '/var/run/image-hash.sock' },
    embedding: { socket_path: '/var/run/embedding.sock' },
    'video-frame-extract': { socket_path: '/var/run/video-frame-extract.sock' },
  },
  pipelines: {
    binary: { sha256: { algorithm: 'sha256' } },
    image: { sha256: { algorithm: 'sha256' }, phash: { algorithm: 'phash' } },
    video: {
      sha256: { algorithm: 'sha256' },
      phash: { extractor: 'video-frames', algorithm: 'phash' },
      clip: { extractor: 'video-frames', algorithm: 'clip', pooling: 'mean' },
    },
  },
};

describe('AlgorithmService.deriveRecipe', () => {
  const service = new AlgorithmService();

  it.each([
    ['image', 'sha256', 'image.sha256'],
    ['binary', 'sha256', 'binary.sha256'],
    ['video', 'phash', 'video.phash'],
  ])(
    'joins mime group "%s" and algorithm "%s" with a dot, deterministically -> %s',
    (mimeGroup, pipelineName, expected) => {
      expect(service.deriveRecipe(mimeGroup, pipelineName)).toBe(expected);
    },
  );
});

describe('AlgorithmService.deriveAlgorithms', () => {
  const service = new AlgorithmService();

  it('derives one entry per pipeline step, in pipeline order', () => {
    const derived = service.deriveAlgorithms(CONFIG);

    expect(derived).toEqual([
      { recipe: 'binary.sha256', comparison: 'exact' },
      { recipe: 'image.sha256', comparison: 'exact' },
      { recipe: 'image.phash', comparison: 'hamming' },
      { recipe: 'video.sha256', comparison: 'exact' },
      { recipe: 'video.phash', comparison: 'hamming' },
      { recipe: 'video.clip', comparison: 'cosine' },
    ]);
  });

  it('derives the same underlying algorithm as distinct recipes per mime group', () => {
    const derived = service.deriveAlgorithms(CONFIG);
    const sha256Recipes = derived.filter((entry) => entry.recipe.endsWith('.sha256')).map((entry) => entry.recipe);

    expect(sha256Recipes).toEqual(['binary.sha256', 'image.sha256', 'video.sha256']);
  });

  it('returns an empty list for a config with no pipelines', () => {
    const emptyConfig: Config = { ...CONFIG, pipelines: {} };

    expect(service.deriveAlgorithms(emptyConfig)).toEqual([]);
  });
});
