import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatError,
  printJson,
  printTable,
  printSuccess,
  printError,
} from '../../../../src/presentation/cli/output.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatError', () => {
  it.each([
    ['a plain string', 'a plain string', 'a plain string'],
    ['a number', 42, '42'],
  ])('returns String(err) for a non-Error value (%s)', (_name, err, expected) => {
    expect(formatError(err)).toBe(expected);
  });

  it('returns just the message for an Error with no cause', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('appends a single Error cause, joined by " — caused by: "', () => {
    const err = new Error('outer failed', { cause: new Error('inner failed') });

    expect(formatError(err)).toBe('outer failed — caused by: inner failed');
  });

  it('walks a multi-level cause chain, one segment per Error', () => {
    const root = new Error('root cause');
    const middle = new Error('middle failure', { cause: root });
    const err = new Error('top failure', { cause: middle });

    expect(formatError(err)).toBe('top failure — caused by: middle failure — caused by: root cause');
  });

  it('stops at the first non-Error cause without including it', () => {
    const err = new Error('outer failed', { cause: 'a string cause' });

    expect(formatError(err)).toBe('outer failed');
  });
});

describe('printJson', () => {
  it('writes pretty-printed JSON to stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printJson({ foo: 'bar' });

    expect(write).toHaveBeenCalledWith(JSON.stringify({ foo: 'bar' }, null, 2) + '\n');
  });
});

describe('printTable', () => {
  it('writes "(no results)" for an empty row set', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printTable([], ['recipe', 'hashes']);

    expect(write).toHaveBeenCalledWith('(no results)\n');
  });

  it('renders header, separator, and rows with exact column widths and 2-space gaps', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printTable(
      [
        { a: 'x', b: 'yy' },
        { a: 'zzz', b: 'w' },
      ],
      ['a', 'b'],
    );

    // Widths: col 'a' -> max(header 1, 'x' 1, 'zzz' 3) = 3; col 'b' -> max(header 1, 'yy' 2, 'w' 1) = 2.
    // Deliberately picked so header < some values and values differ in length per column, to
    // distinguish Math.max from Math.min and catch a dropped/emptied width-computation loop.
    expect(write).toHaveBeenNthCalledWith(1, 'a'.padEnd(3) + '  ' + 'b'.padEnd(2) + '\n');
    expect(write).toHaveBeenNthCalledWith(2, '-'.repeat(3) + '  ' + '-'.repeat(2) + '\n');
    expect(write).toHaveBeenNthCalledWith(3, 'x'.padEnd(3) + '  ' + 'yy'.padEnd(2) + '\n');
    expect(write).toHaveBeenNthCalledWith(4, 'zzz'.padEnd(3) + '  ' + 'w'.padEnd(2) + '\n');
    expect(write).toHaveBeenCalledTimes(4);
  });

  it('renders null/undefined cell values as an empty (padded) string, not the literal "null"/"undefined"', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printTable(
      [
        { recipe: 'a', hashes: undefined },
        { recipe: 'b', hashes: null },
      ],
      ['recipe', 'hashes'],
    );

    // Both columns end up width 6 (the 'recipe'/'hashes' headers are the longest thing in
    // each column here) — the point of this case is the empty-string fallback, not widths.
    expect(write).toHaveBeenNthCalledWith(3, 'a'.padEnd(6) + '  ' + ''.padEnd(6) + '\n');
    expect(write).toHaveBeenNthCalledWith(4, 'b'.padEnd(6) + '  ' + ''.padEnd(6) + '\n');
  });
});

describe('printSuccess', () => {
  it.each([
    ['a non-empty message', 'done', 'done\n'],
    ['an empty message', '', '\n'],
  ])('writes %s (with trailing newline) to stdout', (_name, message, expectedWrite) => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printSuccess(message);

    expect(write).toHaveBeenCalledWith(expectedWrite);
  });
});

describe('printError', () => {
  it('writes an "Error: "-prefixed message to stderr', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    printError('something broke');

    expect(write).toHaveBeenCalledWith('Error: something broke\n');
  });
});
