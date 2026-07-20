/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */

export function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }

  const parts = [err.message];
  let cause: unknown = err.cause;

  while (cause instanceof Error) {
    parts.push(cause.message);
    cause = cause.cause;
  }

  return parts.join(' — caused by: ');
}

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export function printTable(rows: Record<string, unknown>[], columns: string[]): void {
  if (rows.length === 0) {
    process.stdout.write('(no results)\n');

    return;
  }

  const widths: number[] = columns.map((col) => col.length);
  for (const row of rows) {
    columns.forEach((col, i) => {
      const val = String((row[col] as string | number | boolean | null | undefined) ?? '');
      /* v8 ignore next */
      widths[i] = Math.max(widths[i] ?? col.length, val.length);
    });
  }

  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  /* v8 ignore next */
  const header = columns.map((col, i) => col.padEnd(widths[i] ?? col.length)).join('  ');

  process.stdout.write(header + '\n');
  process.stdout.write(separator + '\n');

  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const cellValue = String((row[col] as string | number | boolean | null | undefined) ?? '');
        /* v8 ignore next */
        const width = widths[i] ?? col.length;

        return cellValue.padEnd(width);
      })
      .join('  ');
    process.stdout.write(line + '\n');
  }
}

export function printSuccess(message: string): void {
  process.stdout.write(message + '\n');
}

export function printError(message: string): void {
  process.stderr.write('Error: ' + message + '\n');
}
