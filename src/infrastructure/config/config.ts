/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, type Config } from './types.js';
import { ConfigError } from './errors.js';
import { AlgorithmKind, ComparisonType, NativeAlgorithm } from '../../domain/model/pipeline.model.js';

export function loadConfig(configPath: string): Config {
  const raw = readConfigFile(configPath);
  const parsed = parseConfigYaml(raw, configPath);

  const result = ConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw ConfigError.schemaInvalid(configPath, result.error.toString());
  }

  validateCrossReferences(result.data, configPath);

  return result.data;
}

export function resolveConfigPath(): string {
  const configPath = process.env.CONFIG_PATH;

  if (configPath === undefined || configPath.length === 0) {
    throw ConfigError.missingConfigPathEnv();
  }

  return configPath;
}

function readConfigFile(configPath: string): string {
  try {
    return readFileSync(configPath, 'utf-8');
  } catch (err) {
    throw ConfigError.fileReadFailed(configPath, err);
  }
}

function parseConfigYaml(raw: string, configPath: string): unknown {
  try {
    return parseYaml(raw);
  } catch (err) {
    throw ConfigError.yamlParseFailed(configPath, err);
  }
}

/**
 * Fail-fast checks beyond zod's per-field schema. Subservice socket reachability is
 * checked separately at bootstrap (needs a live client), not here.
 */
function validateCrossReferences(config: Config, configPath: string): void {
  const mimeGroups = new Set(Object.values(config.mime_to_group));

  for (const group of mimeGroups) {
    if (!(group in config.pipelines)) {
      throw ConfigError.mimeGroupMissingPipelines(configPath, group);
    }
  }

  validateDeclaredAlgorithms(config, configPath);
  validateDeclaredExtractors(config, configPath);

  for (const [mimeGroup, namedPipelines] of Object.entries(config.pipelines)) {
    for (const [pipelineName, step] of Object.entries(namedPipelines)) {
      validatePipelineStep(config, configPath, mimeGroup, pipelineName, step);
    }
  }
}

function validateDeclaredAlgorithms(config: Config, configPath: string): void {
  for (const [code, entry] of Object.entries(config.algorithms)) {
    if (entry.kind === AlgorithmKind.NATIVE && !isSupportedNativeAlgorithm(code)) {
      // Stryker disable next-line StringLiteral
      throw ConfigError.unsupportedNativeAlgorithm(configPath, code, Object.values(NativeAlgorithm).join(', '));
    }
    if (entry.kind === AlgorithmKind.SUBSERVICE && !(entry.subservice in config.subservices)) {
      throw ConfigError.unknownSubserviceForAlgorithm(configPath, code, entry.subservice);
    }
  }
}

function validateDeclaredExtractors(config: Config, configPath: string): void {
  for (const [name, entry] of Object.entries(config.extractors)) {
    if (!(entry.subservice in config.subservices)) {
      throw ConfigError.unknownSubserviceForExtractor(configPath, name, entry.subservice);
    }
  }
}

function validatePipelineStep(
  config: Config,
  configPath: string,
  mimeGroup: string,
  pipelineName: string,
  step: Config['pipelines'][string][string],
): void {
  const stepLabel = `pipelines.${mimeGroup}.${pipelineName}`;
  const fail = (message: string): never => {
    throw ConfigError.invalidPipelineStep(configPath, message);
  };

  const algorithmEntry = config.algorithms[step.algorithm];

  if (!algorithmEntry) {
    fail(`${stepLabel} references unknown algorithm "${step.algorithm}"`);

    return;
  }

  if (step.extractor !== undefined) {
    const extractorEntry = config.extractors[step.extractor];

    if (!extractorEntry) {
      fail(`${stepLabel} references unknown extractor "${step.extractor}"`);

      return;
    }
  }

  if (step.pooling !== undefined) {
    if (step.extractor === undefined) {
      fail(`${stepLabel} sets "pooling" without an "extractor" — pooling only applies to extractor steps`);
    }
    if (algorithmEntry.comparison !== ComparisonType.COSINE) {
      fail(
        `${stepLabel} sets "pooling" on algorithm "${step.algorithm}", whose comparison is ` +
          `"${algorithmEntry.comparison}" — pooling is only meaningful for comparison: cosine`,
      );
    }
  }
}

function isSupportedNativeAlgorithm(code: string): code is NativeAlgorithm {
  return (Object.values(NativeAlgorithm) as string[]).includes(code);
}
