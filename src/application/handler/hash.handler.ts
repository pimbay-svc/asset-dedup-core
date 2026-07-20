/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { CommandHandler } from '../command.gateway.js';
import { CalculateHash, type CalculateHashResult } from '../command/hash.command.js';
import type { MimeService } from '../service/mime.service.js';
import type { PipelineService } from '../service/pipeline.service.js';

export class HashHandlers {
  constructor(
    private readonly mimeService: MimeService,
    private readonly pipelineService: PipelineService,
  ) {}

  async calculate(command: CalculateHash): Promise<CalculateHashResult> {
    const { mimeGroup } = await this.mimeService.resolve(command.mimeHint, command.fileBuffer);

    return this.pipelineService.process({
      mimeGroup,
      buffer: command.fileBuffer,
      recipes: command.recipes,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  asHandlers(): CommandHandler<any, any>[] {
    const calculate: CommandHandler<CalculateHash, CalculateHashResult> = {
      commandClass: CalculateHash,
      execute: this.calculate.bind(this),
    };

    return [calculate];
  }
}
