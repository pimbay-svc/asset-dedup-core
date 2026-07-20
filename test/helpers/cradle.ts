import type { Cradle } from '../../src/infrastructure/container.js';

/** Builds a fake `Cradle` from whichever slice a test needs, cast so callers skip unrelated deps. */
export function fakeCradle(overrides: Partial<Cradle> = {}): Cradle {
  return overrides as Cradle;
}
