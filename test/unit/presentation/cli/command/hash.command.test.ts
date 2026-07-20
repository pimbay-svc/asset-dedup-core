import { describe, it, expect, vi, afterEach, type MockInstance } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Command } from 'commander';
import { buildHashCommand } from '../../../../../src/presentation/cli/command/hash.command.js';
import { CalculateHash, type CalculateHashResult } from '../../../../../src/application/command/hash.command.js';
import type { Cradle } from '../../../../../src/infrastructure/container.js';
import { fakeCradle } from '../../../../helpers/cradle.js';
import * as output from '../../../../../src/presentation/cli/output.js';

// Partial mock: real formatting/writing behavior stays intact for output.test.ts's own exact-string
// coverage — here we only need to observe *what* hash.command.ts passes to printTable/printSuccess,
// precisely, instead of parsing rendered stdout text back out with fragile substring checks.
vi.mock('../../../../../src/presentation/cli/output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof output>();

  return { ...actual, printTable: vi.fn(actual.printTable), printSuccess: vi.fn(actual.printSuccess) };
});

let workdir: string | undefined;

function makeFile(name: string, content = 'irrelevant'): string {
  const dir = workdir ?? mkdtempSync(path.join(tmpdir(), 'asset-dedup-core-cli-hash-'));
  workdir = dir;
  const filePath = path.join(dir, name);
  writeFileSync(filePath, content);

  return filePath;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(output.printTable).mockClear();
  vi.mocked(output.printSuccess).mockClear();
  if (workdir) {
    rmSync(workdir, { recursive: true, force: true });
    workdir = undefined;
  }
});

function buildAppWith(dispatch: ReturnType<typeof vi.fn>): Command {
  const cradle = fakeCradle({ commandGateway: { dispatch } as unknown as Cradle['commandGateway'] });

  return buildHashCommand(() => cradle);
}

function spyOutput(): {
  stdout: MockInstance<(...args: unknown[]) => boolean>;
  stderr: MockInstance<(...args: unknown[]) => boolean>;
  exit: MockInstance<(...args: unknown[]) => never>;
} {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) as unknown as MockInstance<
    (...args: unknown[]) => boolean
  >;
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true) as unknown as MockInstance<
    (...args: unknown[]) => boolean
  >;
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never) as unknown as MockInstance<
    (...args: unknown[]) => never
  >;

  return { stdout, stderr, exit };
}

describe('buildHashCommand — command metadata', () => {
  it('names and describes the command, subcommand, and both options exactly', () => {
    const command = buildAppWith(vi.fn());

    expect(command.name()).toBe('hash');
    expect(command.description()).toBe('Compute pipeline results for a local file');

    const [fileCommand] = command.commands;

    expect(fileCommand?.name()).toBe('file');
    expect(fileCommand?.description()).toBe("Run a local file through its resolved mime group's pipelines");

    const recipesOption = fileCommand?.options.find((o) => o.long === '--recipes');
    const jsonOption = fileCommand?.options.find((o) => o.long === '--json');

    expect(recipesOption?.description).toBe(
      'Comma-separated recipes to run (default: every recipe for the resolved mime group)',
    );
    expect(jsonOption?.description).toBe('Output as JSON');
  });
});

describe('buildHashCommand — errors', () => {
  it('prints an error and exits 1 when the file has no extension', async () => {
    const filePath = makeFile('no-extension-file');
    const dispatch = vi.fn();
    const { stderr, exit } = spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath], { from: 'user' });

    expect(dispatch).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/no file extension/));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('prints an error and exits 1 when the file cannot be read', async () => {
    const dispatch = vi.fn();
    const { stderr, exit } = spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', '/does/not/exist.jpg'], { from: 'user' });

    expect(dispatch).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
  it('prints an error and exits 1 when the command fails with a non-Error rejection', async () => {
    const filePath = makeFile('asset.jpg');
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- intentionally non-Error, to exercise the `err instanceof Error ? ... : String(err)` fallback branch
    const dispatch = vi.fn(() => Promise.reject('a plain string rejection'));
    const { stderr, exit } = spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath], { from: 'user' });

    expect(stderr).toHaveBeenCalledWith('Error: a plain string rejection\n');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('buildHashCommand — dispatch', () => {
  it('dispatches CalculateHash with an "extension" hint derived from the filename, and no recipes by default', async () => {
    const filePath = makeFile('asset.jpg');
    const dispatch = vi.fn(() => Promise.resolve({ results: [] }) as Promise<CalculateHashResult>);
    spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath], { from: 'user' });

    expect(dispatch).toHaveBeenCalledWith(
      new CalculateHash(Buffer.from('irrelevant'), { type: 'extension', value: 'jpg' }, null),
    );
  });

  it('parses --recipes into a trimmed, non-empty array', async () => {
    const filePath = makeFile('asset.jpg');
    const dispatch = vi.fn(() => Promise.resolve({ results: [] }) as Promise<CalculateHashResult>);
    spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath, '--recipes', ' image.sha256 , image.phash '], {
      from: 'user',
    });

    expect(dispatch).toHaveBeenCalledWith(
      new CalculateHash(Buffer.from('irrelevant'), { type: 'extension', value: 'jpg' }, [
        'image.sha256',
        'image.phash',
      ]),
    );
  });

  it('treats a --recipes value with no real entries the same as omitting it', async () => {
    const filePath = makeFile('asset.jpg');
    const dispatch = vi.fn(() => Promise.resolve({ results: [] }) as Promise<CalculateHashResult>);
    spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath, '--recipes', ' , , '], { from: 'user' });

    expect(dispatch).toHaveBeenCalledWith(
      new CalculateHash(Buffer.from('irrelevant'), { type: 'extension', value: 'jpg' }, null),
    );
  });
});

describe('buildHashCommand — output', () => {
  it('prints full results as JSON with --json', async () => {
    const filePath = makeFile('asset.jpg');
    const results: CalculateHashResult['results'] = [{ recipe: 'image.sha256', hashes: ['abc123'] }];
    const dispatch = vi.fn(() => Promise.resolve({ results }));
    const { stdout } = spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath, '--json'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith(JSON.stringify({ results }, null, 2) + '\n');
  });

  it('formats a hashes-only result set exactly: joined by ", ", correct columns, no vectors table', async () => {
    const filePath = makeFile('asset.jpg');
    const results: CalculateHashResult['results'] = [
      { recipe: 'image.sha256', hashes: ['abc123', 'def456'] },
      { recipe: 'image.md5', hashes: ['9999'] },
    ];
    const dispatch = vi.fn(() => Promise.resolve({ results }));
    spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath], { from: 'user' });

    expect(output.printTable).toHaveBeenCalledExactlyOnceWith(
      [
        { recipe: 'image.sha256', hashes: 'abc123, def456' },
        { recipe: 'image.md5', hashes: '9999' },
      ],
      ['recipe', 'hashes'],
    );
    expect(output.printSuccess).not.toHaveBeenCalled();
  });

  it('formats a vectors-only result set exactly: preview capped at 5, "; "-joined, correct remaining count', async () => {
    const filePath = makeFile('asset.jpg');
    const results: CalculateHashResult['results'] = [
      {
        recipe: 'image.clip',
        vectors: [
          [1, 2],
          [3, 4],
          [5, 6],
          [7, 8],
          [9, 10],
          [11, 12],
          [13, 14],
        ],
      },
    ];
    const dispatch = vi.fn(() => Promise.resolve({ results }));
    spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath], { from: 'user' });

    expect(output.printTable).toHaveBeenCalledExactlyOnceWith(
      [
        {
          recipe: 'image.clip',
          total: '7',
          vectors: '[1, 2]; [3, 4]; [5, 6]; [7, 8]; [9, 10]',
          remaining: '2',
        },
      ],
      ['recipe', 'total', 'vectors', 'remaining'],
    );
    expect(output.printSuccess).not.toHaveBeenCalled();
  });

  it('leaves "remaining" empty (not "0") when there are 5 or fewer vectors — the boundary itself', async () => {
    const filePath = makeFile('asset.jpg');
    const results: CalculateHashResult['results'] = [
      {
        recipe: 'image.clip',
        vectors: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      },
    ];
    const dispatch = vi.fn(() => Promise.resolve({ results }));
    spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath], { from: 'user' });

    expect(output.printTable).toHaveBeenCalledExactlyOnceWith(
      [{ recipe: 'image.clip', total: '3', vectors: '[1, 2]; [3, 4]; [5, 6]', remaining: '' }],
      ['recipe', 'total', 'vectors', 'remaining'],
    );
  });

  it('prints both tables, separated by printSuccess(""), when results mix hashes and vectors', async () => {
    const filePath = makeFile('asset.pdf');
    const results: CalculateHashResult['results'] = [
      { recipe: 'pdf.sha256', hashes: ['abc123'] },
      { recipe: 'pdf.embed', vectors: [[1, 2]] },
    ];
    const dispatch = vi.fn(() => Promise.resolve({ results }));
    spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath], { from: 'user' });

    expect(output.printTable).toHaveBeenCalledTimes(2);
    expect(output.printTable).toHaveBeenNthCalledWith(
      1,
      [{ recipe: 'pdf.sha256', hashes: 'abc123' }],
      ['recipe', 'hashes'],
    );
    expect(output.printTable).toHaveBeenNthCalledWith(
      2,
      [{ recipe: 'pdf.embed', total: '1', vectors: '[1, 2]', remaining: '' }],
      ['recipe', 'total', 'vectors', 'remaining'],
    );
    expect(output.printSuccess).toHaveBeenCalledExactlyOnceWith('');
  });

  it('prints neither table for an empty result set', async () => {
    const filePath = makeFile('asset.jpg');
    const dispatch = vi.fn(() => Promise.resolve({ results: [] }));
    const { stdout } = spyOutput();

    await buildAppWith(dispatch).parseAsync(['file', filePath], { from: 'user' });

    expect(stdout).not.toHaveBeenCalled();
    expect(output.printTable).not.toHaveBeenCalled();
    expect(output.printSuccess).not.toHaveBeenCalled();
  });
});
