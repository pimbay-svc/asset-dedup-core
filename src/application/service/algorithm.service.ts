/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { Config } from '../../infrastructure/config/types.js';
import type { ComparisonType } from '../../domain/model/pipeline.model.js';

export interface DerivedAlgorithm {
  recipe: string;
  comparison: ComparisonType;
}

export class AlgorithmService {
  deriveRecipe(mimeGroup: string, pipelineName: string): string {
    return `${mimeGroup}.${pipelineName}`;
  }

  /**
   * One entry per named pipeline: `{ recipe, comparison }`. Pure function of `pipelines` +
   * `algorithms[*].comparison` — never hand-authored in config, spec §3.
   */
  deriveAlgorithms(config: Config): DerivedAlgorithm[] {
    const derived: DerivedAlgorithm[] = [];

    for (const [mimeGroup, namedPipelines] of Object.entries(config.pipelines)) {
      for (const [pipelineName, step] of Object.entries(namedPipelines)) {
        const algorithmEntry = config.algorithms[step.algorithm];

        // Unreachable — validated by config.ts at startup.
        /* v8 ignore next 3 */
        if (!algorithmEntry) {
          continue;
        }

        derived.push({
          recipe: this.deriveRecipe(mimeGroup, pipelineName),
          comparison: algorithmEntry.comparison,
        });
      }
    }

    return derived;
  }
}
