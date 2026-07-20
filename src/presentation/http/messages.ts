/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export const HttpServerMessage = {
  UNHANDLED_ERROR: 'unhandled error',
  ASSET_STORAGE_FAILURE: 'asset storage failure',
  UNEXPECTED_ERROR: 'unexpected error',
  INTERNAL_ERROR: 'internal error',
} as const;
