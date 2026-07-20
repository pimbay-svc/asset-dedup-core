/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { NodeEnv, type Env } from './env/env.js';

export function resolveTransport(env: Env): { target: string; options?: Record<string, unknown> } | undefined {
  if (env.NODE_ENV === NodeEnv.PRODUCTION) {
    return undefined;
  }
  if (env.NODE_ENV === NodeEnv.TEST) {
    return { target: 'pino/file', options: { destination: 'var/logs/test.log', mkdir: true } };
  }

  return { target: 'pino-pretty' };
}

export function createLoggerOptions(env: Env): Record<string, unknown> {
  return {
    level: env.LOG_LEVEL,
    transport: resolveTransport(env),
  };
}
