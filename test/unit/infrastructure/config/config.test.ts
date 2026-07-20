import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig, resolveConfigPath } from '../../../../src/infrastructure/config/config.js';
import { ConfigError } from '../../../../src/infrastructure/config/errors.js';

let tmpDir: string | undefined;

function writeConfig(yaml: string): string {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'asset-dedup-core-test-'));
  const configPath = path.join(tmpDir, 'config.yaml');
  writeFileSync(configPath, yaml, 'utf-8');

  return configPath;
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

const VALID_CONFIG = `
mime_to_group:
  image/jpeg: image
  "*": binary

subservices:
  image-hash:
    socket_path: /var/run/image-hash.sock

algorithms:
  sha256:
    kind: native
    comparison: exact
  phash:
    kind: subservice
    subservice: image-hash
    comparison: hamming
    config:
      hash_size: 8

pipelines:
  binary:
    sha256:
      algorithm: sha256
  image:
    sha256:
      algorithm: sha256
    phash:
      algorithm: phash
`;

describe('loadConfig', () => {
  it('loads and returns a valid config', () => {
    const configPath = writeConfig(VALID_CONFIG);
    const config = loadConfig(configPath);

    expect(Object.keys(config.pipelines.image ?? {})).toHaveLength(2);
    expect(config.algorithms.phash?.kind).toBe('subservice');
  });

  it('defaults extractors and subservices to an empty object when the sections are omitted', () => {
    const configPath = writeConfig(`
mime_to_group:
  "*": binary
algorithms:
  sha256:
    kind: native
    comparison: exact
pipelines:
  binary:
    sha256:
      algorithm: sha256
`);

    const config = loadConfig(configPath);

    expect(config.extractors).toEqual({});
    expect(config.subservices).toEqual({});
  });

  it('defaults extractors and subservices to an empty object when present but given no value (YAML null)', () => {
    const configPath = writeConfig(`
mime_to_group:
  "*": binary
subservices:
extractors:
algorithms:
  sha256:
    kind: native
    comparison: exact
pipelines:
  binary:
    sha256:
      algorithm: sha256
`);

    const config = loadConfig(configPath);

    expect(config.extractors).toEqual({});
    expect(config.subservices).toEqual({});
  });

  it('loads extractors and a pooling step for a cosine algorithm', () => {
    const configPath = writeConfig(`
mime_to_group:
  video/mp4: video
  "*": binary
subservices:
  embedding:
    socket_path: /var/run/embedding.sock
  video-frame-extract:
    socket_path: /var/run/video-frame-extract.sock
algorithms:
  sha256:
    kind: native
    comparison: exact
  clip:
    kind: subservice
    subservice: embedding
    comparison: cosine
extractors:
  video-frames:
    subservice: video-frame-extract
    config:
      frame_count: 5
pipelines:
  binary:
    sha256:
      algorithm: sha256
  video:
    sha256:
      algorithm: sha256
    clip:
      extractor: video-frames
      algorithm: clip
      pooling: mean
`);

    const config = loadConfig(configPath);

    expect(config.pipelines.video?.clip).toEqual({ extractor: 'video-frames', algorithm: 'clip', pooling: 'mean' });
  });

  it('throws when the config file does not exist', () => {
    expect(() => loadConfig('/nonexistent/path/config.yaml')).toThrow(/failed to read config file/);

    try {
      loadConfig('/nonexistent/path/config.yaml');
      expect.unreachable('loadConfig should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).name).toBe('ConfigError');
      expect((err as ConfigError).cause).toBeInstanceOf(Error);
    }
  });

  it('throws when the YAML itself is malformed', () => {
    const configPath = writeConfig(`
mime_to_group:
  image/jpeg: [this is not valid: yaml: at all
`);

    expect(() => loadConfig(configPath)).toThrow(/failed to parse YAML config/);

    try {
      loadConfig(configPath);
      expect.unreachable('loadConfig should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).cause).toBeInstanceOf(Error);
    }
  });

  it.each([
    [
      'mime_to_group is missing the mandatory "*" fallback',
      `
mime_to_group:
  image/jpeg: image
algorithms:
  sha256:
    kind: native
    comparison: exact
pipelines:
  image:
    sha256:
      algorithm: sha256
`,
      (): RegExp => /invalid config/,
    ],
    [
      'an algorithm entry has an invalid kind discriminant',
      `
mime_to_group:
  "*": binary
algorithms:
  sha256:
    kind: bogus
    comparison: exact
pipelines:
  binary:
    sha256:
      algorithm: sha256
`,
      (): RegExp => /invalid config/,
    ],
    [
      'a mime group from mime_to_group has no matching pipelines entry',
      `
mime_to_group:
  image/jpeg: image
  "*": binary
algorithms:
  sha256:
    kind: native
    comparison: exact
pipelines:
  binary:
    sha256:
      algorithm: sha256
`,
      (): RegExp => /mime group "image".*no matching pipelines entry/,
    ],
    [
      'a pipeline step references an unknown algorithm',
      `
mime_to_group:
  "*": binary
algorithms:
  sha256:
    kind: native
    comparison: exact
pipelines:
  binary:
    sha256:
      algorithm: does-not-exist
`,
      (configPath: string): string =>
        'invalid config at ' + configPath + ': pipelines.binary.sha256 references unknown algorithm "does-not-exist"',
    ],
    [
      'a kind: native algorithm is not sha256',
      `
mime_to_group:
  "*": binary
algorithms:
  md5:
    kind: native
    comparison: exact
pipelines:
  binary:
    md5:
      algorithm: md5
`,
      (): RegExp => /only sha256 run natively/,
    ],
    [
      'a kind: subservice algorithm references an unknown subservice',
      `
mime_to_group:
  "*": binary
algorithms:
  phash:
    kind: subservice
    subservice: does-not-exist
    comparison: hamming
pipelines:
  binary:
    phash:
      algorithm: phash
`,
      (): RegExp => /algorithm "phash" references unknown subservice "does-not-exist"/,
    ],
    [
      'a pipeline step references an unknown extractor',
      `
mime_to_group:
  "*": binary
algorithms:
  sha256:
    kind: native
    comparison: exact
pipelines:
  binary:
    sha256:
      extractor: does-not-exist
      algorithm: sha256
`,
      (configPath: string): string =>
        'invalid config at ' + configPath + ': pipelines.binary.sha256 references unknown extractor "does-not-exist"',
    ],
    [
      'an extractor references an unknown subservice',
      `
mime_to_group:
  "*": binary
algorithms:
  sha256:
    kind: native
    comparison: exact
extractors:
  pages:
    subservice: does-not-exist
pipelines:
  binary:
    sha256:
      extractor: pages
      algorithm: sha256
`,
      (): RegExp => /extractor "pages" references unknown subservice "does-not-exist"/,
    ],
    [
      'pooling is set without an extractor',
      `
mime_to_group:
  "*": binary
subservices:
  embedding:
    socket_path: /var/run/embedding.sock
algorithms:
  clip:
    kind: subservice
    subservice: embedding
    comparison: cosine
pipelines:
  binary:
    clip:
      algorithm: clip
      pooling: mean
`,
      (configPath: string): string =>
        'invalid config at ' +
        configPath +
        ': pipelines.binary.clip sets "pooling" without an "extractor" — pooling only applies to extractor steps',
    ],
    [
      'pooling is set on a non-cosine algorithm',
      `
mime_to_group:
  "*": binary
subservices:
  image-hash:
    socket_path: /var/run/image-hash.sock
algorithms:
  phash:
    kind: subservice
    subservice: image-hash
    comparison: hamming
extractors:
  frames:
    subservice: image-hash
pipelines:
  binary:
    phash:
      extractor: frames
      algorithm: phash
      pooling: mean
`,
      (configPath: string): string =>
        'invalid config at ' +
        configPath +
        ': pipelines.binary.phash sets "pooling" on algorithm "phash", whose comparison is ' +
        '"hamming" — pooling is only meaningful for comparison: cosine',
    ],
    [
      "a mime group's pipelines entry defines zero named pipelines",
      `
mime_to_group:
  "*": binary
algorithms:
  sha256:
    kind: native
    comparison: exact
pipelines:
  binary: {}
`,
      (): RegExp => /at least one named pipeline/,
    ],
  ])('throws when %s', (_name, yaml, expected) => {
    const configPath = writeConfig(yaml);

    expect(() => loadConfig(configPath)).toThrow(expected(configPath));
  });
});

describe('resolveConfigPath', () => {
  const originalConfigPath = process.env.CONFIG_PATH;

  afterEach(() => {
    if (originalConfigPath === undefined) {
      delete process.env.CONFIG_PATH;
    } else {
      process.env.CONFIG_PATH = originalConfigPath;
    }
  });

  it('returns CONFIG_PATH when set', () => {
    process.env.CONFIG_PATH = '/etc/asset-dedup-core/config.yaml';

    expect(resolveConfigPath()).toBe('/etc/asset-dedup-core/config.yaml');
  });

  it.each([
    ['unset', undefined],
    ['an empty string', ''],
  ])('throws when CONFIG_PATH is %s', (_name, value) => {
    if (value === undefined) {
      delete process.env.CONFIG_PATH;
    } else {
      process.env.CONFIG_PATH = value;
    }

    expect(() => resolveConfigPath()).toThrow(/CONFIG_PATH environment variable must be set/);
  });
});
