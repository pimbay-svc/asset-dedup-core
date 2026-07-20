import { describe, it, expect } from 'vitest';
import { loadEnv, NodeEnv } from '../../../../src/infrastructure/env/env.js';
import { EnvError } from '../../../../src/infrastructure/env/errors.js';

describe('loadEnv', () => {
  it('fills in every default on an empty environment', () => {
    const env = loadEnv({});

    expect(env.NODE_ENV).toBe(NodeEnv.PRODUCTION);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PORT).toBe(3000);
    expect(env.ASSET_WORKDIR).toBe('./var/assets');
    expect(env.SUBSERVICE_CALL_TIMEOUT_MS).toBe(30000);
  });

  it('coerces PORT and SUBSERVICE_CALL_TIMEOUT_MS from strings', () => {
    const env = loadEnv({ PORT: '8080', SUBSERVICE_CALL_TIMEOUT_MS: '5000' });

    expect(env.PORT).toBe(8080);
    expect(env.SUBSERVICE_CALL_TIMEOUT_MS).toBe(5000);
  });

  it('accepts an explicit ASSET_WORKDIR override', () => {
    const env = loadEnv({ ASSET_WORKDIR: '/var/lib/core/assets' });

    expect(env.ASSET_WORKDIR).toBe('/var/lib/core/assets');
  });

  it.each([
    ['an invalid NODE_ENV value', { NODE_ENV: 'staging' }, /invalid environment configuration/],
    ['a non-numeric PORT', { PORT: 'not-a-number' }, EnvError],
    ['a zero or negative SUBSERVICE_CALL_TIMEOUT_MS', { SUBSERVICE_CALL_TIMEOUT_MS: '0' }, EnvError],
  ])('throws EnvError for %s', (_name, source, expected) => {
    expect(() => loadEnv(source)).toThrow(expected);
  });
});
