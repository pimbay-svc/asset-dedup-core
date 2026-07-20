import { describe, it, expect } from 'vitest';
import { ServerMessage } from '../../src/messages.js';

describe('ServerMessage', () => {
  it.each([
    ['FATAL_STARTUP_ERROR', ServerMessage.FATAL_STARTUP_ERROR, 'fatal error during startup:'],
    ['SHUTTING_DOWN', ServerMessage.SHUTTING_DOWN, 'shutting down'],
    [
      'GRACEFUL_SHUTDOWN_TIMEOUT',
      ServerMessage.GRACEFUL_SHUTDOWN_TIMEOUT,
      'graceful shutdown did not finish in time, forcing exit',
    ],
  ])('exposes %s', (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });
});
