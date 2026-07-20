import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { CryptoHasher } from '../../../../src/infrastructure/hasher/cryptoHasher.js';

describe('CryptoHasher', () => {
  it('computes a sha256 hex digest matching node:crypto directly', () => {
    const hasher = new CryptoHasher();
    const buffer = Buffer.from('hello world');

    const result = hasher.hash(buffer, 'sha256');

    expect(result).toBe(createHash('sha256').update(buffer).digest('hex'));
  });

  it('is deterministic for identical input', () => {
    const hasher = new CryptoHasher();
    const buffer = Buffer.from('deterministic check');

    expect(hasher.hash(buffer, 'sha256')).toBe(hasher.hash(buffer, 'sha256'));
  });

  it('produces different hashes for different input', () => {
    const hasher = new CryptoHasher();

    const a = hasher.hash(Buffer.from('a'), 'sha256');
    const b = hasher.hash(Buffer.from('b'), 'sha256');

    expect(a).not.toBe(b);
  });
});
