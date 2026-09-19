/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Single source of truth for the version reported by both the OpenAPI doc (http/server.ts) and
// the CLI's `--version` (cli/cli.ts) — read once from VERSION instead of duplicating it.
const versionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../VERSION');

export const SERVICE_VERSION = readFileSync(versionPath, 'utf-8').trim();
