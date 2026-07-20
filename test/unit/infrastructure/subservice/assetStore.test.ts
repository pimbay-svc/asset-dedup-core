import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as FsPromises from 'node:fs/promises';
import { AssetStore } from '../../../../src/infrastructure/subservice/assetStore.js';
import { AssetStorageError } from '../../../../src/domain/errors.js';
import { makeEnv } from '../../../helpers/env.js';

const rmMock = vi.fn();

vi.mock('node:fs/promises', async (importOriginal): Promise<typeof FsPromises> => {
  const actual = await importOriginal<typeof FsPromises>();

  return {
    ...actual,
    rm: (...args: Parameters<typeof actual.rm>): ReturnType<typeof actual.rm> => {
      const override = rmMock(...args) as ReturnType<typeof actual.rm> | undefined;

      return override ?? actual.rm(...args);
    },
  };
});

let workdir: string | undefined;

function makeStore(): AssetStore {
  workdir = mkdtempSync(path.join(tmpdir(), 'asset-dedup-core-assetstore-'));

  return new AssetStore(makeEnv({ ASSET_WORKDIR: workdir }));
}

afterEach(() => {
  if (workdir) {
    rmSync(workdir, { recursive: true, force: true });
    workdir = undefined;
  }
  rmMock.mockReset();
  vi.restoreAllMocks();
});

describe('AssetStore', () => {
  it('writes the asset buffer to a fresh per-asset directory and returns its path', async () => {
    const store = makeStore();
    const buffer = Buffer.from('hello world');

    const { assetId, path: assetPath } = await store.writeAsset(buffer);

    expect(assetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(existsSync(assetPath)).toBe(true);
    expect(readFileSync(assetPath)).toEqual(buffer);
    expect(assetPath).toContain(assetId);
  });

  it('gives each write a distinct assetId/path even for identical content', async () => {
    const store = makeStore();
    const buffer = Buffer.from('same content');

    const first = await store.writeAsset(buffer);
    const second = await store.writeAsset(buffer);

    expect(first.assetId).not.toBe(second.assetId);
    expect(first.path).not.toBe(second.path);
  });

  it('resolves a relative ASSET_WORKDIR to an absolute path — the path is handed to separate subservice processes with their own cwd, not just read back by core itself', async () => {
    workdir = mkdtempSync(path.join(tmpdir(), 'asset-dedup-core-assetstore-'));
    vi.spyOn(process, 'cwd').mockReturnValue(workdir);

    const store = new AssetStore(makeEnv({ ASSET_WORKDIR: './relative-assets' }));
    const { path: assetPath } = await store.writeAsset(Buffer.from('data'));

    expect(path.isAbsolute(assetPath)).toBe(true);
    expect(assetPath.startsWith(path.resolve(workdir, 'relative-assets'))).toBe(true);
    expect(existsSync(assetPath)).toBe(true);
  });

  it('removes the whole per-asset directory on cleanup', async () => {
    const store = makeStore();
    const { assetId, path: assetPath } = await store.writeAsset(Buffer.from('data'));

    await store.cleanup(assetId);

    expect(existsSync(assetPath)).toBe(false);
    expect(existsSync(path.dirname(assetPath))).toBe(false);
  });

  it('does not throw when cleaning up an assetId that was never written', async () => {
    const store = makeStore();

    await expect(store.cleanup('never-written')).resolves.toBeUndefined();
  });

  it('wraps a write failure in AssetStorageError', async () => {
    const store = new AssetStore(makeEnv({ ASSET_WORKDIR: '/nonexistent/root/that/cannot/be/created\0invalid' }));

    await expect(store.writeAsset(Buffer.from('x'))).rejects.toThrow(/failed to persist asset to shared workdir:/);

    try {
      await store.writeAsset(Buffer.from('x'));
      expect.unreachable('writeAsset should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AssetStorageError);
      expect((err as AssetStorageError).cause).toBeInstanceOf(Error);
    }
  });

  it('wraps a cleanup failure in AssetStorageError', async () => {
    rmMock.mockRejectedValueOnce(new Error('permission denied'));
    const store = makeStore();

    await expect(store.cleanup('some-id')).rejects.toThrow(/failed to clean up asset workdir "/);

    rmMock.mockRejectedValueOnce(new Error('permission denied'));
    try {
      await store.cleanup('some-id');
      expect.unreachable('cleanup should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AssetStorageError);
      expect((err as AssetStorageError).cause).toBeInstanceOf(Error);
      expect((err as AssetStorageError).message).toContain('permission denied');
    }
  });
});
