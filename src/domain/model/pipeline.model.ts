/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export const ComparisonType = {
  EXACT: 'exact',
  HAMMING: 'hamming',
  COSINE: 'cosine',
} as const;
export type ComparisonType = (typeof ComparisonType)[keyof typeof ComparisonType];

export const Pooling = {
  MEAN: 'mean',
} as const;
export type Pooling = (typeof Pooling)[keyof typeof Pooling];

export const AlgorithmKind = {
  NATIVE: 'native',
  SUBSERVICE: 'subservice',
} as const;
export type AlgorithmKind = (typeof AlgorithmKind)[keyof typeof AlgorithmKind];

/** Only native algorithm implemented in-process so far — see config.ts validation. */
export const NativeAlgorithm = {
  SHA256: 'sha256',
} as const;
export type NativeAlgorithm = (typeof NativeAlgorithm)[keyof typeof NativeAlgorithm];

/** Wildcard key in `mime_to_group` — mandatory fallback, per spec §1. */
export const WILDCARD_MIME = '*';
