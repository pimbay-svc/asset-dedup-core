/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { z } from 'zod';
import { ComparisonType, Pooling, AlgorithmKind, WILDCARD_MIME } from '../../domain/model/pipeline.model.js';

const comparisonTypeSchema = z.enum([ComparisonType.EXACT, ComparisonType.HAMMING, ComparisonType.COSINE]);

const NativeAlgorithmEntrySchema = z.object({
  kind: z.literal(AlgorithmKind.NATIVE),
  comparison: comparisonTypeSchema,
});

const SubserviceAlgorithmEntrySchema = z.object({
  kind: z.literal(AlgorithmKind.SUBSERVICE),
  subservice: z.string().min(1),
  comparison: comparisonTypeSchema,
  config: z.record(z.string(), z.unknown()).default({}),
});

export const AlgorithmEntrySchema = z.discriminatedUnion('kind', [
  NativeAlgorithmEntrySchema,
  SubserviceAlgorithmEntrySchema,
]);

export type AlgorithmEntry = z.infer<typeof AlgorithmEntrySchema>;
export type NativeAlgorithmEntry = z.infer<typeof NativeAlgorithmEntrySchema>;
export type SubserviceAlgorithmEntry = z.infer<typeof SubserviceAlgorithmEntrySchema>;

export const ExtractorEntrySchema = z.object({
  subservice: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});

export type ExtractorEntry = z.infer<typeof ExtractorEntrySchema>;

export const SubserviceEntrySchema = z.object({
  socket_path: z.string().min(1),
});

export type SubserviceEntry = z.infer<typeof SubserviceEntrySchema>;

export const PipelineStepSchema = z.object({
  extractor: z.string().min(1).optional(),
  algorithm: z.string().min(1),
  pooling: z.enum([Pooling.MEAN]).optional(),
});

export type PipelineStep = z.infer<typeof PipelineStepSchema>;

export const MimeGroupPipelinesSchema = z
  .record(z.string(), PipelineStepSchema)
  .refine((map) => Object.keys(map).length > 0, {
    message: "a mime group's pipelines entry must define at least one named pipeline",
  });

export type MimeGroupPipelines = z.infer<typeof MimeGroupPipelinesSchema>;

export const ConfigSchema = z.object({
  mime_to_group: z.record(z.string(), z.string()).refine((map) => WILDCARD_MIME in map, {
    message: `mime_to_group must include a mandatory "${WILDCARD_MIME}" fallback entry`,
  }),
  algorithms: z.record(z.string(), AlgorithmEntrySchema),
  extractors: z
    .record(z.string(), ExtractorEntrySchema)
    .nullish()
    .transform((value) => value ?? {}),
  subservices: z
    .record(z.string(), SubserviceEntrySchema)
    .nullish()
    .transform((value) => value ?? {}),
  pipelines: z.record(z.string(), MimeGroupPipelinesSchema),
});

export type Config = z.infer<typeof ConfigSchema>;
