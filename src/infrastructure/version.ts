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

interface PackageJson {
  version: string;
}

// Single source of truth for the version reported by both the OpenAPI doc (http/server.ts) and
// the CLI's `--version` (cli/cli.ts) — read once from package.json instead of duplicating it.
const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageJson;

export const SERVICE_VERSION = packageJson.version;
