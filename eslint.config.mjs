// @ts-check

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import header from '@tony.ganchev/eslint-plugin-header';

export default defineConfig(
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      eslintConfigPrettier,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce spec coding standards
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      curly: ['error', 'all'],
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are forbidden. Use named exports only.',
        },
      ],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: 'if' },
        { blankLine: 'any', prev: 'if', next: 'if' },
      ],
    },
  },
  {
    files: ['src/server.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { '@tony.ganchev': header },
    rules: {
      '@tony.ganchev/header': [
        'error',
        {
          header: {
            commentType: 'block',
            lines: [
              '*',
              ' * This file is part of the PimBay Asset Dedup service.',
              ' *',
              ' * @author Jan Sarmir <sarmir@pimbay.dev>',
              ' * @link   https://pimbay.dev',
              ' *',
              ' * For the full license information, see the LICENSE file.',
              ' ',
            ],
          },
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.cjs'],
  },
);
