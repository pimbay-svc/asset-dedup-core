/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export const algorithmsResponseSchema = {
  type: 'object',
  properties: {
    algorithms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          recipe: { type: 'string' },
          comparison: { type: 'string' },
        },
      },
    },
  },
} as const;
