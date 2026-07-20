/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { printJson, printTable, printSuccess, printError, formatError } from '../output.js';
import type { Cradle } from '../../../infrastructure/container.js';
import { CalculateHash, type CalculateHashResult } from '../../../application/command/hash.command.js';
import { MimeMismatchError } from '../../../domain/errors.js';

function parseRecipes(raw: string | undefined): string[] | null {
  if (raw === undefined) {
    return null;
  }

  const recipes = raw
    .split(',')
    .map((recipe) => recipe.trim())
    .filter((recipe) => recipe.length > 0);

  return recipes.length > 0 ? recipes : null;
}

function formatHashRow(
  result: Extract<CalculateHashResult['results'][number], { hashes: string[] }>,
): Record<string, unknown> {
  return {
    recipe: result.recipe,
    hashes: result.hashes.join(', '),
  };
}

function formatVectorRow(
  result: Extract<CalculateHashResult['results'][number], { vectors: number[][] }>,
): Record<string, unknown> {
  const total = result.vectors.length;
  const preview = result.vectors.slice(0, 5).map((vector) => `[${vector.join(', ')}]`);
  const remaining = total - preview.length;

  return {
    recipe: result.recipe,
    total: String(total),
    vectors: preview.join('; '),
    remaining: remaining > 0 ? String(remaining) : '',
  };
}

export function buildHashCommand(getCradle: () => Cradle): Command {
  const command = new Command('hash').description('Compute pipeline results for a local file');

  command
    .command('file <path>')
    .description("Run a local file through its resolved mime group's pipelines")
    .option('--recipes <recipes>', 'Comma-separated recipes to run (default: every recipe for the resolved mime group)')
    .option('--json', 'Output as JSON')
    .action(async (filePath: string, opts: { recipes?: string; json?: boolean }) => {
      try {
        const { commandGateway } = getCradle();

        // The extension is only a *hint* — core verifies it against the file's actual content
        // and lets the content win if they disagree (see MimeService).
        // Stryker disable next-line all
        const extension = path.extname(filePath).replace(/^\./, '');

        if (extension.length === 0) {
          throw MimeMismatchError.missingFileExtension(filePath);
        }

        const fileBuffer = await readFile(filePath);
        const recipes = parseRecipes(opts.recipes);

        const { results } = await commandGateway.dispatch(
          new CalculateHash(fileBuffer, { type: 'extension', value: extension }, recipes),
        );

        if (opts.json === true) {
          printJson({ results });
        } else {
          const hashResults = results.filter(
            (result): result is Extract<typeof result, { hashes: string[] }> => 'hashes' in result,
          );
          const vectorResults = results.filter(
            (result): result is Extract<typeof result, { vectors: number[][] }> => 'vectors' in result,
          );

          if (hashResults.length > 0) {
            printTable(hashResults.map(formatHashRow), ['recipe', 'hashes']);
          }
          if (hashResults.length > 0 && vectorResults.length > 0) {
            printSuccess('');
          }
          if (vectorResults.length > 0) {
            printTable(vectorResults.map(formatVectorRow), ['recipe', 'total', 'vectors', 'remaining']);
          }
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  return command;
}
