/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export const hashRequestBodySchema = {
  type: 'object',
  required: ['mime_hint', 'file_content', 'recipes'],
  properties: {
    mime_hint: {
      type: 'object',
      required: ['type', 'value'],
      properties: {
        type: { type: 'string', enum: ['mime', 'extension'] },
        value: { type: 'string', minLength: 1 },
      },
    },
    file_content: { type: 'string', minLength: 1 },
    recipes: {
      type: ['array', 'null'],
      items: { type: 'string', minLength: 1 },
    },
  },
} as const;

const resultEntrySchema = {
  type: 'object',
  properties: {
    recipe: { type: 'string' },
    hashes: { type: 'array', items: { type: 'string' } },
    vectors: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
  },
} as const;

export const hashResponseSchema = {
  type: 'object',
  properties: {
    results: { type: 'array', items: resultEntrySchema },
  },
} as const;
