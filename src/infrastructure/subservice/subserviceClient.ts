/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { Config } from '../config/types.js';
import type { Env } from '../env/env.js';
import { SubserviceUnavailableError } from '../../domain/errors.js';
import type {
  SubserviceBatchParams,
  SubserviceOutputItem,
  SubserviceRunner,
} from '../../domain/provider/subservice.provider.js';
import { SubserviceConnection } from './subserviceConnection.js';

export class SubserviceClient implements SubserviceRunner {
  private readonly connections = new Map<string, SubserviceConnection>();

  constructor(
    private readonly config: Config,
    private readonly env: Env,
  ) {}

  async verifyReachable(subservice: string): Promise<boolean> {
    try {
      await this.connectionFor(subservice).connect();

      return true;
    } catch {
      return false;
    }
  }

  async batch(params: SubserviceBatchParams): Promise<Record<string, SubserviceOutputItem>> {
    return this.connectionFor(params.subservice).call(params.op, params.config, params.inputs);
  }

  async close(): Promise<void> {
    await Promise.all(Array.from(this.connections.values()).map((connection) => connection.close()));
  }

  private connectionFor(subservice: string): SubserviceConnection {
    const existing = this.connections.get(subservice);

    if (existing) {
      return existing;
    }

    const entry = this.config.subservices[subservice];

    if (!entry) {
      throw SubserviceUnavailableError.missingSocketPath(subservice);
    }

    const connection = new SubserviceConnection(subservice, entry.socket_path, this.env.SUBSERVICE_CALL_TIMEOUT_MS);
    this.connections.set(subservice, connection);

    return connection;
  }
}
