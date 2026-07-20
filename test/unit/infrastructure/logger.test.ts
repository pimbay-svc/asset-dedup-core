import { describe, it, expect } from 'vitest';
import { resolveTransport, createLoggerOptions } from '../../../src/infrastructure/logger.js';
import { NodeEnv } from '../../../src/infrastructure/env/env.js';
import { makeEnv } from '../../helpers/env.js';

describe('logger', () => {
  describe('resolveTransport', () => {
    it.each([
      ['production (structured JSON straight to stdout)', NodeEnv.PRODUCTION, undefined],
      ['test', NodeEnv.TEST, { target: 'pino/file', options: { destination: 'var/logs/test.log', mkdir: true } }],
      ['development', NodeEnv.DEVELOPMENT, { target: 'pino-pretty' }],
    ])('returns the expected transport for %s', (_name, nodeEnv, expected) => {
      expect(resolveTransport(makeEnv({ NODE_ENV: nodeEnv }))).toEqual(expected);
    });
  });

  describe('createLoggerOptions', () => {
    it.each([
      [
        'defaults to log level "info" when LOG_LEVEL is unset',
        { NODE_ENV: NodeEnv.PRODUCTION },
        { level: 'info', transport: undefined },
      ],
      [
        'uses LOG_LEVEL when set',
        { NODE_ENV: NodeEnv.PRODUCTION, LOG_LEVEL: 'debug' },
        { level: 'debug', transport: undefined },
      ],
      [
        'includes the resolved transport for the current NODE_ENV',
        { NODE_ENV: NodeEnv.TEST },
        {
          level: 'info',
          transport: { target: 'pino/file', options: { destination: 'var/logs/test.log', mkdir: true } },
        },
      ],
    ])('%s', (_name, envOverrides, expected) => {
      expect(createLoggerOptions(makeEnv(envOverrides))).toEqual(expected);
    });
  });
});
