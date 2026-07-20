/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export class ConfigError extends Error {
  private constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConfigError';
  }

  /** Shared "invalid config at <path>: <detail>" shape used by most cross-reference checks. */
  private static invalid(configPath: string, detail: string): ConfigError {
    return new ConfigError(`invalid config at ${configPath}: ${detail}`);
  }

  static schemaInvalid(configPath: string, zodErrorDetails: string): ConfigError {
    return new ConfigError(`invalid config at ${configPath}:\n${zodErrorDetails}`);
  }

  static missingConfigPathEnv(): ConfigError {
    return new ConfigError('CONFIG_PATH environment variable must be set');
  }

  static fileReadFailed(configPath: string, cause: unknown): ConfigError {
    return new ConfigError(`failed to read config file at ${configPath}: ${(cause as Error).message}`, { cause });
  }

  static yamlParseFailed(configPath: string, cause: unknown): ConfigError {
    return new ConfigError(`failed to parse YAML config at ${configPath}: ${(cause as Error).message}`, { cause });
  }

  static mimeGroupMissingPipelines(configPath: string, group: string): ConfigError {
    return ConfigError.invalid(
      configPath,
      `mime group "${group}" (from mime_to_group) has no matching pipelines entry`,
    );
  }

  static unsupportedNativeAlgorithm(configPath: string, code: string, supportedAlgorithms: string): ConfigError {
    return ConfigError.invalid(
      configPath,
      `algorithm "${code}" is declared kind: native, but only ${supportedAlgorithms} run natively — anything else must be kind: subservice`,
    );
  }

  static unknownSubserviceForAlgorithm(configPath: string, code: string, subservice: string): ConfigError {
    return ConfigError.invalid(configPath, `algorithm "${code}" references unknown subservice "${subservice}"`);
  }

  static unknownSubserviceForExtractor(configPath: string, name: string, subservice: string): ConfigError {
    return ConfigError.invalid(configPath, `extractor "${name}" references unknown subservice "${subservice}"`);
  }

  static invalidPipelineStep(configPath: string, detail: string): ConfigError {
    return ConfigError.invalid(configPath, detail);
  }

  /** Only ever thrown from server.ts's startup check, itself excluded from coverage as a bootstrap wrapper. */
  static subservicesUnreachableAtStartup(unreachable: string[]): ConfigError {
    // Stryker disable next-line all
    /* v8 ignore next */
    return new ConfigError(`subservice socket(s) unreachable at startup: ${unreachable.join(', ')}`);
  }
}
