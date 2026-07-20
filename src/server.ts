/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { NodeEnv, loadEnv } from './infrastructure/env/env.js';
import { loadConfig, resolveConfigPath } from './infrastructure/config/config.js';
import { buildContainer } from './infrastructure/container.js';
import { buildHttpServer } from './presentation/http/server.js';
import { ConfigError } from './infrastructure/config/errors.js';
import { ServerMessage } from './messages.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const env = loadEnv();
  const config = loadConfig(resolveConfigPath());
  const { container, cleanup } = buildContainer(env, config);

  await verifySubservicesReachable(container.cradle.config.subservices, container.cradle.subserviceClient);

  const server = await buildHttpServer(container.cradle);

  const host = env.NODE_ENV === NodeEnv.PRODUCTION ? '0.0.0.0' : '127.0.0.1';
  await server.listen({ port: env.PORT, host });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    container.cradle.logger.info({ signal }, ServerMessage.SHUTTING_DOWN);

    const forceExitTimer = setTimeout(() => {
      container.cradle.logger.warn(ServerMessage.GRACEFUL_SHUTDOWN_TIMEOUT);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    await server.close();
    await cleanup();
    clearTimeout(forceExitTimer);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/**
 * Refuses to start if a subservice socket is unreachable — a strict startup check,
 * separate from the per-request fail-closed policy.
 */
async function verifySubservicesReachable(
  subservices: Record<string, unknown>,
  client: { verifyReachable: (name: string) => Promise<boolean> },
): Promise<void> {
  const names = Object.keys(subservices);
  const results = await Promise.all(
    names.map(async (name) => ({ name, reachable: await client.verifyReachable(name) })),
  );
  const unreachable = results.filter((result) => !result.reachable).map((result) => result.name);

  if (unreachable.length > 0) {
    throw ConfigError.subservicesUnreachableAtStartup(unreachable);
  }
}

main().catch((err: unknown) => {
  console.error(ServerMessage.FATAL_STARTUP_ERROR, err);
  process.exit(1);
});
