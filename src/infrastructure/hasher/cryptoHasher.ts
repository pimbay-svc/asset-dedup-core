/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { createHash } from 'node:crypto';
import type { Hasher } from '../../domain/provider/hasher.provider.js';

export class CryptoHasher implements Hasher {
  hash(buffer: Buffer, algorithm: string): string {
    return createHash(algorithm).update(buffer).digest('hex');
  }
}
