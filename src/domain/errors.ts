/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export abstract class AssetDedupCoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidFileContentError extends AssetDedupCoreError {
  private constructor(message: string) {
    super(message);
  }

  static empty(): InvalidFileContentError {
    return new InvalidFileContentError('file_content must not be empty');
  }

  static notValidBase64(): InvalidFileContentError {
    return new InvalidFileContentError('file_content is not valid base64');
  }
}

/** A `recipes` filter entry doesn't match any `{mime_group}.{pipeline_name}` known to the current config. */
export class UnknownRecipeError extends AssetDedupCoreError {
  private constructor(message: string) {
    super(message);
  }

  static unknownRecipe(recipe: string): UnknownRecipeError {
    return new UnknownRecipeError(`unknown recipe "${recipe}"`);
  }
}

/** A claimed `mime_hint: { type: "mime" }` doesn't match the sniffed content — fail-closed, never silently corrected. */
export class MimeMismatchError extends AssetDedupCoreError {
  private constructor(message: string) {
    super(message);
  }

  static contentMismatch(claimedMime: string, sniffedMime: string): MimeMismatchError {
    return new MimeMismatchError(
      `claimed mime "${claimedMime}" does not match the mime detected from the file's content ("${sniffedMime}")`,
    );
  }

  /** The CLI has no mime hint at all to offer — the local file's name carries no extension. */
  static missingFileExtension(filePath: string): MimeMismatchError {
    return new MimeMismatchError(`cannot determine a mime hint — "${filePath}" has no file extension`);
  }
}

export class AssetStorageError extends AssetDedupCoreError {
  private constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }

  static persistFailed(cause: unknown): AssetStorageError {
    return new AssetStorageError(`failed to persist asset to shared workdir: ${(cause as Error).message}`, {
      cause,
    });
  }

  static cleanupFailed(dir: string, cause: unknown): AssetStorageError {
    return new AssetStorageError(`failed to clean up asset workdir "${dir}": ${(cause as Error).message}`, {
      cause,
    });
  }
}

/** A `kind: subservice` socket did not respond, timed out, dropped mid-call, or sent a malformed frame. */
export class SubserviceUnavailableError extends AssetDedupCoreError {
  private constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }

  static missingSocketPath(subservice: string): SubserviceUnavailableError {
    return new SubserviceUnavailableError(`no socket_path configured for subservice "${subservice}"`);
  }

  static socketError(name: string, cause: Error): SubserviceUnavailableError {
    return new SubserviceUnavailableError(`subservice "${name}" socket error: ${cause.message}`, { cause });
  }

  static clientClosed(name: string): SubserviceUnavailableError {
    return new SubserviceUnavailableError(`subservice "${name}" client closed`);
  }

  /** `connect()` should only ever reject with a real `Error` — this is a type-safety fallback. */
  static unknownConnectFailure(err: unknown): SubserviceUnavailableError {
    return new SubserviceUnavailableError(String(err));
  }

  static callTimedOut(name: string, timeoutMs: number): SubserviceUnavailableError {
    return new SubserviceUnavailableError(`subservice "${name}" call timed out after ${String(timeoutMs)}ms`);
  }

  static writeFailed(name: string, cause: Error): SubserviceUnavailableError {
    return new SubserviceUnavailableError(`subservice "${name}" write failed: ${cause.message}`, { cause });
  }

  static connectionDropped(name: string): SubserviceUnavailableError {
    return new SubserviceUnavailableError(`subservice "${name}" connection dropped`);
  }
}

/**
 * Any error anywhere in a socket response aborts the whole asset (fail-closed) —
 * wraps whichever step/cause triggered the abort.
 */
export class PipelineExecutionError extends AssetDedupCoreError {
  private constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }

  static mimeGroupUnresolved(mime: string): PipelineExecutionError {
    return new PipelineExecutionError(
      `no mime group could be resolved for mime "${mime}" (missing "*" fallback in config)`,
    );
  }

  static recipeNotConfigured(recipe: string): PipelineExecutionError {
    return new PipelineExecutionError(`recipe "${recipe}" is not configured`);
  }

  /** Unreachable in practice — MimeGroupPipelinesSchema requires at least one entry, validated at startup. */
  static noDefaultRecipeForFallbackGroup(fallbackGroup: string): PipelineExecutionError {
    return new PipelineExecutionError(`no default recipe configured for fallback group "${fallbackGroup}"`);
  }

  /** Unreachable in practice — validated by config.ts at startup. */
  static noPipelineForMimeGroup(mimeGroup: string): PipelineExecutionError {
    return new PipelineExecutionError(`no pipeline configured for mime group "${mimeGroup}"`);
  }

  static stepFailed(recipe: string, cause: unknown): PipelineExecutionError {
    const message = cause instanceof Error ? cause.message : String(cause);

    return new PipelineExecutionError(`step for recipe "${recipe}" failed: ${message}`, { cause });
  }

  /** Unreachable in practice — validated by config.ts at startup. */
  static algorithmNotConfigured(algorithm: string): PipelineExecutionError {
    return new PipelineExecutionError(`algorithm "${algorithm}" is not configured`);
  }

  /** Unreachable in practice — validated by config.ts at startup. */
  static extractorNotConfigured(extractor: string): PipelineExecutionError {
    return new PipelineExecutionError(`extractor "${extractor}" is not configured`);
  }

  static extractorMissingPaths(extractorName: string): PipelineExecutionError {
    return new PipelineExecutionError(`extractor "${extractorName}" response is missing "paths"`);
  }

  static missingOutputForId(key: string): PipelineExecutionError {
    return new PipelineExecutionError(`subservice response is missing output for id "${key}"`);
  }

  static subserviceReportedItemError(key: string, code: string, message: string): PipelineExecutionError {
    return new PipelineExecutionError(`subservice reported an error for id "${key}": [${code}] ${message}`);
  }

  static mixedOrMissingOutputs(recipe: string): PipelineExecutionError {
    return new PipelineExecutionError(`recipe "${recipe}" produced a mix of hash/vector or missing outputs`);
  }

  static poolingMissingVector(recipe: string): PipelineExecutionError {
    return new PipelineExecutionError(`recipe "${recipe}" has pooling: mean but a sub-item has no vector`);
  }
}
