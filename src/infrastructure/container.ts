/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix';
import pino from 'pino';
import type { Config } from './config/types.js';
import type { Env } from './env/env.js';
import { createLoggerOptions } from './logger.js';
import { AlgorithmService } from '../application/service/algorithm.service.js';
import { PipelineService } from '../application/service/pipeline.service.js';
import { MimeService } from '../application/service/mime.service.js';
import { CommandGateway } from '../application/command.gateway.js';
import { HashHandlers } from '../application/handler/hash.handler.js';
import { CryptoHasher } from './hasher/cryptoHasher.js';
import { SubserviceClient } from './subservice/subserviceClient.js';
import { AssetStore } from './subservice/assetStore.js';
import { FileTypeMimeDetector } from './mime/fileTypeMimeDetector.js';
import type { MimeDetector } from '../domain/provider/mime.provider.js';

export interface Cradle {
  env: Env;
  config: Config;
  logger: pino.Logger;

  hasher: CryptoHasher;
  subserviceClient: SubserviceClient;
  assetStore: AssetStore;
  mimeDetector: MimeDetector;
  algorithmService: AlgorithmService;
  mimeService: MimeService;
  pipelineService: PipelineService;
  commandGateway: CommandGateway;
  hashHandlers: HashHandlers;
}

export interface BuiltContainer {
  container: AwilixContainer<Cradle>;
  cleanup: () => Promise<void>;
}

export function buildContainer(env: Env, config: Config): BuiltContainer {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.CLASSIC });
  const logger = pino(createLoggerOptions(env));

  container.register({
    env: asValue(env),
    config: asValue(config),
    logger: asValue(logger),

    hasher: asClass(CryptoHasher).singleton(),
    subserviceClient: asClass(SubserviceClient).singleton(),
    assetStore: asClass(AssetStore).singleton(),
    mimeDetector: asClass(FileTypeMimeDetector).singleton(),
    algorithmService: asClass(AlgorithmService).singleton(),
    mimeService: asClass(MimeService).singleton(),
    pipelineService: asClass(PipelineService).singleton(),
    commandGateway: asClass(CommandGateway).singleton(),
    hashHandlers: asClass(HashHandlers).singleton(),
  });

  container.cradle.commandGateway.registerAll([...container.cradle.hashHandlers.asHandlers()]);

  return {
    container,
    cleanup: async (): Promise<void> => {
      await container.cradle.subserviceClient.close();
    },
  };
}
