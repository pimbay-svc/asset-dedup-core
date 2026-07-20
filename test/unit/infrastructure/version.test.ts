import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SERVICE_VERSION } from '../../../src/infrastructure/version.js';

describe('SERVICE_VERSION', () => {
  it('matches the version currently in package.json', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8')) as {
      version: string;
    };

    expect(SERVICE_VERSION).toBe(packageJson.version);
  });
});
