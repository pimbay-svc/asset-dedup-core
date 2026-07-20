import { loadEnv, type Env } from '../../src/infrastructure/env/env.js';

/** Builds a valid `Env` via the real `loadEnv`/zod validation, so fixtures stay honest about coercion/defaults. Pass overrides as raw `process.env` strings. */
export function makeEnv(overrides: Partial<Record<string, string>> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    PORT: '3000',
    ASSET_WORKDIR: './var/test/assets',
    SUBSERVICE_CALL_TIMEOUT_MS: '30000',
    ...overrides,
  });
}
