/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { Command } from '../command.gateway.js';
import type { MimeHint } from '../service/mime.service.js';
import type { PipelineResultEntry } from '../service/pipeline.service.js';

export interface CalculateHashResult {
  results: PipelineResultEntry[];
}

export class CalculateHash implements Command<CalculateHashResult> {
  declare readonly _resultType?: () => CalculateHashResult;

  constructor(
    public readonly fileBuffer: Buffer,
    public readonly mimeHint: MimeHint,
    public readonly recipes: string[] | null,
  ) {}
}
