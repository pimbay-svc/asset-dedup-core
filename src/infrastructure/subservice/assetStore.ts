/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AssetStorageError } from '../../domain/errors.js';
import type { Env } from '../env/env.js';

/**
 * Subservices exchange file paths over unix sockets, not payload bytes — core decodes the
 * uploaded asset onto this shared volume first. Extractor sub-item files also live here.
 */
export class AssetStore {
  private readonly workdir: string;

  constructor(env: Env) {
    this.workdir = path.resolve(env.ASSET_WORKDIR);
  }

  async writeAsset(buffer: Buffer): Promise<{ assetId: string; path: string }> {
    const assetId = randomUUID();
    const dir = path.join(this.workdir, assetId);
    const filePath = path.join(dir, 'asset');

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, buffer);
    } catch (err) {
      throw AssetStorageError.persistFailed(err);
    }

    return { assetId, path: filePath };
  }

  /** Removes an asset's whole working directory (original file + any extracted sub-items). */
  async cleanup(assetId: string): Promise<void> {
    const dir = path.join(this.workdir, assetId);

    try {
      await rm(dir, { recursive: true, force: true });
    } catch (err) {
      throw AssetStorageError.cleanupFailed(dir, err);
    }
  }
}
