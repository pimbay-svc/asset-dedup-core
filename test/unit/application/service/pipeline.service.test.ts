import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PipelineService } from '../../../../src/application/service/pipeline.service.js';
import { AlgorithmService } from '../../../../src/application/service/algorithm.service.js';
import { PipelineExecutionError, UnknownRecipeError } from '../../../../src/domain/errors.js';
import type { Config } from '../../../../src/infrastructure/config/types.js';
import type { Hasher } from '../../../../src/domain/provider/hasher.provider.js';
import type {
  SubserviceBatchParams,
  SubserviceOutputItem,
  SubserviceRunner,
} from '../../../../src/domain/provider/subservice.provider.js';
import { SubserviceOp } from '../../../../src/domain/provider/subservice.provider.js';
import type { AssetStore } from '../../../../src/infrastructure/subservice/assetStore.js';

const algorithmService = new AlgorithmService();

const BASE_CONFIG: Config = {
  mime_to_group: { 'image/jpeg': 'image', 'video/mp4': 'video', '*': 'binary' },
  algorithms: {
    sha256: { kind: 'native', comparison: 'exact' },
    phash: { kind: 'subservice', subservice: 'image-hash', comparison: 'hamming', config: { algo: 'phash' } },
    clip: { kind: 'subservice', subservice: 'embedding', comparison: 'cosine', config: {} },
  },
  extractors: {
    'video-frames': { subservice: 'video-frame-extract', config: { frame_count: 5 } },
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

let workdir: string | undefined;

function makeAssetStore(): AssetStore {
  const dir = mkdtempSync(path.join(tmpdir(), 'asset-dedup-core-pipeline-'));
  workdir = dir;
  let counter = 0;

  return {
    writeAsset: vi.fn((buffer: Buffer) => {
      counter += 1;
      const assetId = `asset-${String(counter)}`;
      const assetPath = path.join(dir, `${assetId}.bin`);
      writeFileSync(assetPath, buffer);

      return Promise.resolve({ assetId, path: assetPath });
    }),
    cleanup: vi.fn(() => Promise.resolve(undefined)),
  } as unknown as AssetStore;
}

function makeHasher(): Hasher {
  return {
    hash: vi.fn((buffer: Buffer) => `sha256:${buffer.toString('utf-8')}`),
  };
}

function makeSubserviceClient(
  handler: (params: SubserviceBatchParams) => Record<string, SubserviceOutputItem>,
): SubserviceRunner {
  return {
    verifyReachable: vi.fn(() => Promise.resolve(true)),
    batch: vi.fn((params: SubserviceBatchParams) => Promise.resolve(handler(params))),
    close: vi.fn(() => Promise.resolve(undefined)),
  };
}

afterEach(() => {
  if (workdir) {
    rmSync(workdir, { recursive: true, force: true });
    workdir = undefined;
  }
});

describe('PipelineService.process', () => {
  it('computes a plain native step against the whole asset, wrapped as a length-1 hashes array', async () => {
    const hasher = makeHasher();
    const subserviceClient = makeSubserviceClient(() => ({}));
    const assetStore = makeAssetStore();
    const executor = new PipelineService(BASE_CONFIG, algorithmService, hasher, subserviceClient, assetStore);

    const result = await executor.process({
      mimeGroup: 'binary',
      buffer: Buffer.from('hello'),
      recipes: null,
    });

    expect(result.results).toEqual([{ recipe: 'binary.sha256', hashes: ['sha256:hello'] }]);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn mock property, not a real bound method
    expect(assetStore.cleanup).toHaveBeenCalledOnce();
  });

  it('treats an empty recipes array the same as null — runs every named pipeline', async () => {
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      makeSubserviceClient(() => ({ '0': { hash: 'deadbeef' } })),
      makeAssetStore(),
    );

    const result = await executor.process({
      mimeGroup: 'image',
      buffer: Buffer.from('img'),
      recipes: [],
    });

    expect(result.results).toHaveLength(2);
    expect(result.results.map((entry) => entry.recipe).sort()).toEqual(['image.phash', 'image.sha256']);
  });

  it('computes a plain subservice step against the whole asset, returning a length-1 hashes array', async () => {
    const subserviceClient = makeSubserviceClient((params) => {
      expect(params.subservice).toBe('image-hash');
      expect(params.config).toEqual({ algo: 'phash' });
      expect(params.inputs).toEqual({ '0': { path: expect.stringMatching(/\.bin$/) as string } });

      return { '0': { hash: 'deadbeef' } };
    });
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    const result = await executor.process({
      mimeGroup: 'image',
      buffer: Buffer.from('img'),
      recipes: null,
    });

    expect(result.results).toContainEqual({ recipe: 'image.phash', hashes: ['deadbeef'] });
  });

  it('computes a plain subservice step returning a length-1 vectors array', async () => {
    const config: Config = {
      ...BASE_CONFIG,
      pipelines: { ...BASE_CONFIG.pipelines, image: { clip: { algorithm: 'clip' } } },
    };
    const subserviceClient = makeSubserviceClient(() => ({ '0': { vector: [1, 2, 3] } }));
    const executor = new PipelineService(config, algorithmService, makeHasher(), subserviceClient, makeAssetStore());

    const result = await executor.process({
      mimeGroup: 'image',
      buffer: Buffer.from('img'),
      recipes: null,
    });

    expect(result.results).toEqual([{ recipe: 'image.clip', vectors: [[1, 2, 3]] }]);
  });

  it('runs extractor + algorithm and returns a multi (hashes) result in extraction order', async () => {
    const config: Config = {
      ...BASE_CONFIG,
      pipelines: { ...BASE_CONFIG.pipelines, video: { phash: { extractor: 'video-frames', algorithm: 'phash' } } },
    };
    const subserviceClient = makeSubserviceClient((params) => {
      if (params.subservice === 'video-frame-extract') {
        expect(params.inputs).toEqual({ '0': { path: expect.stringMatching(/\.bin$/) as string } });

        return { '0': { paths: ['/frames/0.png', '/frames/1.png', '/frames/2.png'] } };
      }

      const inputs = params.inputs;

      return Object.fromEntries(Object.keys(inputs).map((key) => [key, { hash: `h${key}` }]));
    });
    const executor = new PipelineService(config, algorithmService, makeHasher(), subserviceClient, makeAssetStore());

    const result = await executor.process({
      mimeGroup: 'video',
      buffer: Buffer.from('vid'),
      recipes: null,
    });

    expect(result.results).toEqual([{ recipe: 'video.phash', hashes: ['h0', 'h1', 'h2'] }]);
  });

  it('runs extractor + algorithm + pooling: mean and returns a length-1 pooled vectors array', async () => {
    const subserviceClient = makeSubserviceClient((params) => {
      if (params.subservice === 'video-frame-extract') {
        return { '0': { paths: ['/frames/0.png', '/frames/1.png'] } };
      }

      return { '0': { vector: [2, 4] }, '1': { vector: [4, 8] } };
    });
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    const result = await executor.process({
      mimeGroup: 'video',
      buffer: Buffer.from('vid'),
      recipes: null,
    });

    expect(result.results).toContainEqual({ recipe: 'video.clip', vectors: [[3, 6]] });
  });

  it('calls the extractor subservice only once for two steps sharing the same (extractor, config)', async () => {
    const extractorBatch = vi.fn(() => ({ '0': { paths: ['/f/0.png'] } }));
    const subserviceClient = makeSubserviceClient((params) => {
      if (params.subservice === 'video-frame-extract') {
        return extractorBatch();
      }

      return Object.fromEntries(Object.keys(params.inputs).map((key) => [key, { hash: `h${key}`, vector: [1] }]));
    });
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    await executor.process({
      mimeGroup: 'video',
      buffer: Buffer.from('vid'),
      recipes: null,
    });

    expect(extractorBatch).toHaveBeenCalledTimes(1);
  });

  it('uses separate cache entries for two different extractors used by the same asset', async () => {
    const config: Config = {
      ...BASE_CONFIG,
      extractors: { ...BASE_CONFIG.extractors, 'other-extract': { subservice: 'embedding', config: {} } },
      pipelines: {
        ...BASE_CONFIG.pipelines,
        video: {
          phash: { extractor: 'video-frames', algorithm: 'phash' },
          clip: { extractor: 'other-extract', algorithm: 'clip' },
        },
      },
    };
    const videoFramesBatch = vi.fn(() => ({ '0': { paths: ['/f/0.png'] } }));
    const otherExtractBatch = vi.fn(() => ({ '0': { paths: ['/g/0.png'] } }));
    const subserviceClient = makeSubserviceClient((params) => {
      if (params.subservice === 'video-frame-extract') {
        return videoFramesBatch();
      }
      if (params.subservice === 'embedding' && params.op === SubserviceOp.EXTRACT) {
        return otherExtractBatch();
      }

      return Object.fromEntries(Object.keys(params.inputs).map((key) => [key, { hash: `h${key}`, vector: [1] }]));
    });
    const executor = new PipelineService(config, algorithmService, makeHasher(), subserviceClient, makeAssetStore());

    await executor.process({ mimeGroup: 'video', buffer: Buffer.from('vid'), recipes: null });

    // A constant (non-differentiating) cache key would incorrectly serve 'other-extract' from
    // 'video-frames'' cached promise instead of calling its own subservice.
    expect(videoFramesBatch).toHaveBeenCalledTimes(1);
    expect(otherExtractBatch).toHaveBeenCalledTimes(1);
  });

  it('runs a native algorithm against extractor sub-items by reading each path from disk', async () => {
    workdir = mkdtempSync(path.join(tmpdir(), 'asset-dedup-core-pipeline-native-multi-'));
    const framePathA = path.join(workdir, 'frame-a.bin');
    const framePathB = path.join(workdir, 'frame-b.bin');
    writeFileSync(framePathA, 'frame-a-bytes');
    writeFileSync(framePathB, 'frame-b-bytes');

    const config: Config = {
      ...BASE_CONFIG,
      pipelines: { ...BASE_CONFIG.pipelines, video: { sha256: { extractor: 'video-frames', algorithm: 'sha256' } } },
    };
    const subserviceClient = makeSubserviceClient(() => ({ '0': { paths: [framePathA, framePathB] } }));
    const hasher = makeHasher();
    const executor = new PipelineService(config, algorithmService, hasher, subserviceClient, makeAssetStore());

    const result = await executor.process({
      mimeGroup: 'video',
      buffer: Buffer.from('vid'),
      recipes: null,
    });

    expect(result.results).toEqual([
      { recipe: 'video.sha256', hashes: ['sha256:frame-a-bytes', 'sha256:frame-b-bytes'] },
    ]);
    expect(hasher.hash).toHaveBeenCalledWith(expect.any(Buffer), 'sha256');
  });

  it('runs extractor + algorithm (no pooling) and returns a multi (vectors) result', async () => {
    const config: Config = {
      ...BASE_CONFIG,
      pipelines: { ...BASE_CONFIG.pipelines, video: { clip: { extractor: 'video-frames', algorithm: 'clip' } } },
    };
    const subserviceClient = makeSubserviceClient((params) => {
      if (params.subservice === 'video-frame-extract') {
        return { '0': { paths: ['/frames/0.png', '/frames/1.png'] } };
      }

      return { '0': { vector: [1, 2] }, '1': { vector: [3, 4] } };
    });
    const executor = new PipelineService(config, algorithmService, makeHasher(), subserviceClient, makeAssetStore());

    const result = await executor.process({
      mimeGroup: 'video',
      buffer: Buffer.from('vid'),
      recipes: null,
    });

    expect(result.results).toEqual([
      {
        recipe: 'video.clip',
        vectors: [
          [1, 2],
          [3, 4],
        ],
      },
    ]);
  });

  it('fails the whole asset (fail-closed) when a subservice item carries an error, and still cleans up', async () => {
    const subserviceClient = makeSubserviceClient(() => ({
      '0': { error: { code: 'corrupt_input', message: 'corrupt image' } },
    }));
    const assetStore = makeAssetStore();
    const executor = new PipelineService(BASE_CONFIG, algorithmService, makeHasher(), subserviceClient, assetStore);

    // Exact message, not a substring regex: a wrapped ("step for recipe ... failed: ...")
    // message would still contain this text as a substring, so a regex wouldn't catch
    // wrapping that should not have happened (the error is already a PipelineExecutionError).
    await expect(
      executor.process({ mimeGroup: 'image', buffer: Buffer.from('img'), recipes: null }),
    ).rejects.toMatchObject({
      constructor: PipelineExecutionError,
      message: 'subservice reported an error for id "0": [corrupt_input] corrupt image',
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn mock property, not a real bound method
    expect(assetStore.cleanup).toHaveBeenCalledOnce();
  });

  it('fails when a subservice response is missing the expected output id', async () => {
    const subserviceClient = makeSubserviceClient(() => ({}));
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    await expect(
      executor.process({ mimeGroup: 'image', buffer: Buffer.from('img'), recipes: null }),
    ).rejects.toMatchObject({
      constructor: PipelineExecutionError,
      message: 'subservice response is missing output for id "0"',
    });
  });

  it('fails when an extractor response is missing "paths"', async () => {
    const subserviceClient = makeSubserviceClient(() => ({ '0': { hash: 'not-paths' } }));
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    await expect(
      executor.process({ mimeGroup: 'video', buffer: Buffer.from('vid'), recipes: null }),
    ).rejects.toMatchObject({
      constructor: PipelineExecutionError,
      message: 'extractor "video-frames" response is missing "paths"',
    });
  });

  it('fails when a single-step result has neither hash nor vector', async () => {
    const subserviceClient = makeSubserviceClient(() => ({ '0': {} }));
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    await expect(executor.process({ mimeGroup: 'image', buffer: Buffer.from('img'), recipes: null })).rejects.toThrow(
      /produced a mix of hash\/vector or missing outputs/,
    );
  });

  it('fails when a multi-step result mixes hash and vector outputs', async () => {
    const config: Config = {
      ...BASE_CONFIG,
      pipelines: { ...BASE_CONFIG.pipelines, video: { phash: { extractor: 'video-frames', algorithm: 'phash' } } },
    };
    const subserviceClient = makeSubserviceClient((params) => {
      if (params.subservice === 'video-frame-extract') {
        return { '0': { paths: ['/f/0.png', '/f/1.png'] } };
      }

      return { '0': { hash: 'h0' }, '1': { vector: [1] } };
    });
    const executor = new PipelineService(config, algorithmService, makeHasher(), subserviceClient, makeAssetStore());

    await expect(executor.process({ mimeGroup: 'video', buffer: Buffer.from('vid'), recipes: null })).rejects.toThrow(
      /mix of hash\/vector or missing outputs/,
    );
  });

  it('fails a pooling: mean step when a sub-item has no vector', async () => {
    const subserviceClient = makeSubserviceClient((params) => {
      if (params.subservice === 'video-frame-extract') {
        return { '0': { paths: ['/f/0.png'] } };
      }

      return { '0': { hash: 'not-a-vector' } };
    });
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    await expect(executor.process({ mimeGroup: 'video', buffer: Buffer.from('vid'), recipes: null })).rejects.toThrow(
      /pooling: mean but a sub-item has no vector/,
    );
  });

  it('wraps an unexpected (non-PipelineExecutionError) failure from a subservice call', async () => {
    const socketError = new Error('socket exploded');
    const subserviceClient: SubserviceRunner = {
      verifyReachable: vi.fn(() => Promise.resolve(true)),
      batch: vi.fn(() => {
        throw socketError;
      }),
      close: vi.fn(() => Promise.resolve(undefined)),
    };
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    await expect(
      executor.process({ mimeGroup: 'image', buffer: Buffer.from('img'), recipes: null }),
    ).rejects.toMatchObject({
      message: 'step for recipe "image.phash" failed: socket exploded',
      cause: socketError,
    });
  });

  it('wraps a thrown non-Error value from a subservice call using its String() form', async () => {
    const subserviceClient: SubserviceRunner = {
      verifyReachable: vi.fn(() => Promise.resolve(true)),
      batch: vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentionally non-Error, to exercise the `err instanceof Error ? ... : String(err)` fallback branch
        throw 'a plain string rejection';
      }),
      close: vi.fn(() => Promise.resolve(undefined)),
    };
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    await expect(
      executor.process({ mimeGroup: 'image', buffer: Buffer.from('img'), recipes: null }),
    ).rejects.toMatchObject({
      message: 'step for recipe "image.phash" failed: a plain string rejection',
      cause: 'a plain string rejection',
    });
  });

  it('always cleans up the asset workdir, even when a step fails', async () => {
    const subserviceClient = makeSubserviceClient(() => ({
      '0': { error: { code: 'internal_error', message: 'boom' } },
    }));
    const assetStore = makeAssetStore();
    const executor = new PipelineService(BASE_CONFIG, algorithmService, makeHasher(), subserviceClient, assetStore);

    await executor.process({ mimeGroup: 'image', buffer: Buffer.from('img'), recipes: null }).catch(() => undefined);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn mock property, not a real bound method
    expect(assetStore.cleanup).toHaveBeenCalledOnce();
  });
});

describe('PipelineService.process — recipes filter', () => {
  it("runs only the requested recipes when they match this asset's mime group", async () => {
    const subserviceClient = makeSubserviceClient(() => ({ '0': { hash: 'deadbeef' } }));
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    const result = await executor.process({
      mimeGroup: 'image',
      buffer: Buffer.from('img'),
      recipes: ['image.sha256'],
    });

    expect(result.results).toEqual([{ recipe: 'image.sha256', hashes: ['sha256:img'] }]);

    expect(subserviceClient.batch).not.toHaveBeenCalled();
  });

  it('runs exactly the requested subset when multiple (but not all) recipes match', async () => {
    const subserviceClient = makeSubserviceClient((params) => ({
      '0': { hash: `hash-for-${(params.config as { algo?: string }).algo ?? params.op}` },
    }));
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    const result = await executor.process({
      mimeGroup: 'video',
      buffer: Buffer.from('vid'),
      recipes: ['video.sha256'],
    });

    expect(result.results).toEqual([{ recipe: 'video.sha256', hashes: ['sha256:vid'] }]);
  });

  it("falls back to the wildcard group's first pipeline when no requested recipe applies to this asset's mime group", async () => {
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      makeSubserviceClient(() => ({})),
      makeAssetStore(),
    );

    // "video.phash" is a real, known recipe — just not one that applies to an image/jpeg asset.
    const result = await executor.process({
      mimeGroup: 'image',
      buffer: Buffer.from('img'),
      recipes: ['video.phash'],
    });

    expect(result.results).toEqual([{ recipe: 'binary.sha256', hashes: ['sha256:img'] }]);
  });

  it('rejects a recipes entry that matches no known recipe anywhere in the config', async () => {
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      makeSubserviceClient(() => ({})),
      makeAssetStore(),
    );

    await expect(
      executor.process({
        mimeGroup: 'image',
        buffer: Buffer.from('img'),
        recipes: ['image.does-not-exist'],
      }),
    ).rejects.toMatchObject({
      constructor: UnknownRecipeError,
      message: 'unknown recipe "image.does-not-exist"',
    });
  });

  it('validates every recipes entry before running anything, even ones for other mime groups', async () => {
    const subserviceClient = makeSubserviceClient(() => ({ '0': { hash: 'deadbeef' } }));
    const executor = new PipelineService(
      BASE_CONFIG,
      algorithmService,
      makeHasher(),
      subserviceClient,
      makeAssetStore(),
    );

    await expect(
      executor.process({
        mimeGroup: 'image',
        buffer: Buffer.from('img'),
        recipes: ['image.sha256', 'totally.unknown'],
      }),
    ).rejects.toThrow(UnknownRecipeError);
  });
});
