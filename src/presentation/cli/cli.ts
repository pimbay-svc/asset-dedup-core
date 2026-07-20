#!/usr/bin/env node
/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { Command } from 'commander';
import { loadEnv } from '../../infrastructure/env/env.js';
import { loadConfig, resolveConfigPath } from '../../infrastructure/config/config.js';
import { buildContainer, type Cradle } from '../../infrastructure/container.js';
import { SERVICE_VERSION } from '../../infrastructure/version.js';
import { buildHashCommand } from './command/hash.command.js';

function createCradleGetter(): { getCradle: () => Cradle; cleanup: () => Promise<void> } {
  let built: ReturnType<typeof buildContainer> | undefined;

  const getCradle = (): Cradle => {
    if (built === undefined) {
      const env = loadEnv();
      const config = loadConfig(resolveConfigPath());
      built = buildContainer(env, config);
    }

    return built.container.cradle;
  };

  const cleanup = async (): Promise<void> => {
    if (built !== undefined) {
      await built.cleanup();
    }
  };

  return { getCradle, cleanup };
}

async function main(): Promise<void> {
  const { getCradle, cleanup } = createCradleGetter();

  const program = new Command();
  program.name('asset-dedup-core-cli').description('CLI for asset-dedup-core').version(SERVICE_VERSION);

  program.addCommand(buildHashCommand(getCradle));

  try {
    await program.parseAsync(process.argv);
  } finally {
    await cleanup();
  }
}

main().catch((err: unknown) => {
  process.stderr.write('Fatal: ' + String(err) + '\n');
  process.exit(1);
});
