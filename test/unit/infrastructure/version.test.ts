import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SERVICE_VERSION } from '../../../src/infrastructure/version.js';

describe('SERVICE_VERSION', () => {
  it('matches the version currently in VERSION', () => {
    const version = readFileSync(new URL('../../../VERSION', import.meta.url), 'utf-8').trim();

    expect(SERVICE_VERSION).toBe(version);
  });
});
