import { vi } from 'vitest';
import type pino from 'pino';

export function fakeLogger(): pino.Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as pino.Logger;
}
