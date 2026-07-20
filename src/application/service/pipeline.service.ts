/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { readFile } from 'node:fs/promises';
import type { Config, AlgorithmEntry, ExtractorEntry, PipelineStep } from '../../infrastructure/config/types.js';
import type { Hasher } from '../../domain/provider/hasher.provider.js';
import type { SubserviceOutputItem, SubserviceRunner } from '../../domain/provider/subservice.provider.js';
import { SubserviceOp } from '../../domain/provider/subservice.provider.js';
import type { AssetStore } from '../../infrastructure/subservice/assetStore.js';
import { AlgorithmKind } from '../../domain/model/pipeline.model.js';
import { PipelineExecutionError, UnknownRecipeError } from '../../domain/errors.js';
import type { AlgorithmService } from './algorithm.service.js';

export interface ProcessAssetParams {
  mimeGroup: string;
  buffer: Buffer;
  recipes: string[] | null;
}

export type PipelineResultEntry = { recipe: string; hashes: string[] } | { recipe: string; vectors: number[][] };

export interface ProcessAssetResult {
  results: PipelineResultEntry[];
}

/** Local to one `process()` run — dedupes identical `(extractor, config)` calls, spec §4 optimization note. */
type ExtractorCache = Map<string, Promise<string[]>>;

interface SelectedPipeline {
  recipe: string;
  step: PipelineStep;
}

export class PipelineService {
  constructor(
    private readonly config: Config,
    private readonly algorithmService: AlgorithmService,
    private readonly hasher: Hasher,
    private readonly subserviceClient: SubserviceRunner,
    private readonly assetStore: AssetStore,
  ) {}

  async process(params: ProcessAssetParams): Promise<ProcessAssetResult> {
    const { mimeGroup, buffer, recipes } = params;
    const selected = this.selectPipelines(mimeGroup, recipes);
    const { assetId, path: assetPath } = await this.assetStore.writeAsset(buffer);
    const extractorCache: ExtractorCache = new Map();

    try {
      const results = await Promise.all(
        selected.map((pipeline) => this.runStep(pipeline, buffer, assetPath, extractorCache)),
      );

      return { results };
    } finally {
      await this.assetStore.cleanup(assetId);
    }
  }

  /**
   * `recipes` empty/null -> every named pipeline for `mimeGroup`. Otherwise every entry is validated against the whole
   * config first (unknown recipe = request error regardless of asset), then narrowed to this mime group's own
   * `"{mimeGroup}."` prefix — falling back to the wildcard group's first pipeline if none apply, rather than nothing.
   */
  private selectPipelines(mimeGroup: string, recipes: string[] | null): SelectedPipeline[] {
    const namedPipelines = this.resolveNamedPipelines(mimeGroup);

    if (recipes === null || recipes.length === 0) {
      return Object.entries(namedPipelines).map(([pipelineName, step]) => ({
        recipe: this.algorithmService.deriveRecipe(mimeGroup, pipelineName),
        step,
      }));
    }

    const knownRecipes = new Set(this.algorithmService.deriveAlgorithms(this.config).map((entry) => entry.recipe));

    for (const recipe of recipes) {
      if (!knownRecipes.has(recipe)) {
        throw UnknownRecipeError.unknownRecipe(recipe);
      }
    }

    const prefix = `${mimeGroup}.`;
    const matching = recipes.filter((recipe) => recipe.startsWith(prefix));

    if (matching.length > 0) {
      return matching.map((recipe) => {
        const pipelineName = recipe.slice(prefix.length);
        const step = namedPipelines[pipelineName];

        // Unreachable — `recipe` was validated against knownRecipes above, and it shares this
        // group's prefix, so config.ts's startup validation guarantees it's a real entry here.
        // Stryker disable all
        /* v8 ignore next 3 */
        if (!step) {
          throw PipelineExecutionError.recipeNotConfigured(recipe);
        }
        // Stryker restore all

        return { recipe, step };
      });
    }

    return [this.selectFallbackPipeline()];
  }

  /** None of the caller's requested recipes apply to this asset's mime group — use the wildcard group's default. */
  private selectFallbackPipeline(): SelectedPipeline {
    const fallbackGroup = this.config.mime_to_group['*'];

    // Unreachable — config.ts validates the mandatory "*" fallback at startup.
    // Stryker disable all
    /* v8 ignore next 3 */
    if (fallbackGroup === undefined) {
      throw PipelineExecutionError.mimeGroupUnresolved('*');
    }
    // Stryker restore all

    const namedPipelines = this.resolveNamedPipelines(fallbackGroup);
    const [firstEntry] = Object.entries(namedPipelines);

    // Unreachable — MimeGroupPipelinesSchema requires at least one entry, validated at startup.
    // Stryker disable all
    /* v8 ignore next 3 */
    if (!firstEntry) {
      throw PipelineExecutionError.noDefaultRecipeForFallbackGroup(fallbackGroup);
    }
    // Stryker restore all

    const [pipelineName, step] = firstEntry;

    return { recipe: this.algorithmService.deriveRecipe(fallbackGroup, pipelineName), step };
  }

  private resolveNamedPipelines(mimeGroup: string): Record<string, PipelineStep> {
    const namedPipelines = this.config.pipelines[mimeGroup];

    // Unreachable — validated by config.ts at startup.
    // Stryker disable all
    /* v8 ignore next 3 */
    if (!namedPipelines) {
      throw PipelineExecutionError.noPipelineForMimeGroup(mimeGroup);
    }
    // Stryker restore all

    return namedPipelines;
  }

  private async runStep(
    pipeline: SelectedPipeline,
    assetBuffer: Buffer,
    assetPath: string,
    extractorCache: ExtractorCache,
  ): Promise<PipelineResultEntry> {
    const { recipe, step } = pipeline;
    const algorithmEntry = this.resolveAlgorithm(step.algorithm);

    try {
      if (step.extractor === undefined) {
        const item = await this.computeSingle(algorithmEntry, assetBuffer, assetPath);

        return this.toResult(recipe, [item]);
      }

      const extractorEntry = this.resolveExtractor(step.extractor);
      const paths = await this.getExtractedPaths(step.extractor, extractorEntry, assetPath, extractorCache);
      const items = await this.computeMany(algorithmEntry, paths);

      if (step.pooling !== undefined) {
        return this.toPooledResult(recipe, items);
      }

      return this.toResult(recipe, items);
    } catch (err) {
      if (err instanceof PipelineExecutionError) {
        throw err;
      }
      throw PipelineExecutionError.stepFailed(recipe, err);
    }
  }

  private resolveAlgorithm(algorithm: string): AlgorithmEntry {
    const entry = this.config.algorithms[algorithm];

    // Unreachable — validated by config.ts at startup.
    // Stryker disable all
    /* v8 ignore next 3 */
    if (!entry) {
      throw PipelineExecutionError.algorithmNotConfigured(algorithm);
    }
    // Stryker restore all

    return entry;
  }

  private resolveExtractor(extractor: string): ExtractorEntry {
    const entry = this.config.extractors[extractor];

    // Unreachable — validated by config.ts at startup.
    // Stryker disable all
    /* v8 ignore next 3 */
    if (!entry) {
      throw PipelineExecutionError.extractorNotConfigured(extractor);
    }
    // Stryker restore all

    return entry;
  }

  private async computeSingle(
    algorithmEntry: AlgorithmEntry,
    assetBuffer: Buffer,
    assetPath: string,
  ): Promise<SubserviceOutputItem> {
    if (algorithmEntry.kind === AlgorithmKind.NATIVE) {
      // config.ts's startup validation guarantees the only kind: native algorithm is sha256.
      return { hash: this.hasher.hash(assetBuffer, 'sha256') };
    }

    const outputs = await this.subserviceClient.batch({
      subservice: algorithmEntry.subservice,
      op: SubserviceOp.HASH,
      config: algorithmEntry.config,
      inputs: { '0': { path: assetPath } },
    });

    return this.pickItem(outputs, '0');
  }

  private async computeMany(algorithmEntry: AlgorithmEntry, paths: string[]): Promise<SubserviceOutputItem[]> {
    if (algorithmEntry.kind === AlgorithmKind.NATIVE) {
      // No native algorithm runs against sub-items today (only sha256, always plain) — not
      // forbidden by config.ts, so keep this correct rather than unsupported.
      const buffers = await Promise.all(paths.map((p) => readFile(p)));

      return buffers.map((buffer) => ({ hash: this.hasher.hash(buffer, 'sha256') }));
    }

    const inputs = Object.fromEntries(paths.map((filePath, index) => [String(index), { path: filePath }]));
    const outputs = await this.subserviceClient.batch({
      subservice: algorithmEntry.subservice,
      op: SubserviceOp.HASH,
      config: algorithmEntry.config,
      inputs,
    });

    return paths.map((_path, index) => this.pickItem(outputs, String(index)));
  }

  private async getExtractedPaths(
    extractorName: string,
    extractorEntry: ExtractorEntry,
    assetPath: string,
    extractorCache: ExtractorCache,
  ): Promise<string[]> {
    const cacheKey = `${extractorName}:${JSON.stringify(extractorEntry.config)}`;
    const cached = extractorCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const promise = this.subserviceClient
      .batch({
        subservice: extractorEntry.subservice,
        op: SubserviceOp.EXTRACT,
        config: extractorEntry.config,
        inputs: { '0': { path: assetPath } },
      })
      .then((outputs) => {
        const item = this.pickItem(outputs, '0');

        if (!item.paths) {
          throw PipelineExecutionError.extractorMissingPaths(extractorName);
        }

        return item.paths;
      });

    extractorCache.set(cacheKey, promise);

    return promise;
  }

  private pickItem(outputs: Record<string, SubserviceOutputItem>, key: string): SubserviceOutputItem {
    const item = outputs[key];

    if (!item) {
      throw PipelineExecutionError.missingOutputForId(key);
    }
    if (item.error !== undefined) {
      throw PipelineExecutionError.subserviceReportedItemError(key, item.error.code, item.error.message);
    }

    return item;
  }

  private toResult(recipe: string, items: SubserviceOutputItem[]): PipelineResultEntry {
    if (items.every(hasHash)) {
      return { recipe, hashes: items.map((item) => item.hash) };
    }
    if (items.every(hasVector)) {
      return { recipe, vectors: items.map((item) => item.vector) };
    }

    throw PipelineExecutionError.mixedOrMissingOutputs(recipe);
  }

  /** `mean` is the only pooling strategy the config schema allows for now — spec §1. */
  private toPooledResult(recipe: string, items: SubserviceOutputItem[]): PipelineResultEntry {
    const vectors = items.map((item) => {
      if (item.vector === undefined) {
        throw PipelineExecutionError.poolingMissingVector(recipe);
      }

      return item.vector;
    });

    return { recipe, vectors: [meanPool(vectors)] };
  }
}

function hasHash(item: SubserviceOutputItem): item is SubserviceOutputItem & { hash: string } {
  return item.hash !== undefined;
}

function hasVector(item: SubserviceOutputItem): item is SubserviceOutputItem & { vector: number[] } {
  return item.vector !== undefined;
}

function meanPool(vectors: number[][]): number[] {
  // `vectors` is always non-empty with same-length entries here — the `?? 0` fallbacks below
  // only satisfy noUncheckedIndexedAccess.
  /* v8 ignore next */
  const dimensions = vectors[0]?.length ?? 0;
  // Equivalent mutant: sums[i] assignment below auto-grows a sparse array to the same
  // length/values regardless of initial size, so pre-sizing here changes nothing observable.
  // Stryker disable next-line all
  const sums = new Array<number>(dimensions).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i += 1) {
      /* v8 ignore next */
      sums[i] = (sums[i] ?? 0) + (vector[i] ?? 0);
    }
  }

  return sums.map((sum) => sum / vectors.length);
}
