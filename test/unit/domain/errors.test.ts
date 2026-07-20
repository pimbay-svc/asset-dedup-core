import { describe, it, expect } from 'vitest';
import {
  AssetDedupCoreError,
  InvalidFileContentError,
  UnknownRecipeError,
  MimeMismatchError,
  AssetStorageError,
  SubserviceUnavailableError,
  PipelineExecutionError,
} from '../../../src/domain/errors.js';

describe('InvalidFileContentError', () => {
  it.each([
    {
      name: 'empty() reports a missing file_content',
      build: (): InvalidFileContentError => InvalidFileContentError.empty(),
      expected: 'file_content must not be empty',
    },
    {
      name: 'notValidBase64() reports an invalid file_content encoding',
      build: (): InvalidFileContentError => InvalidFileContentError.notValidBase64(),
      expected: 'file_content is not valid base64',
    },
  ])('$name', ({ build, expected }) => {
    const err = build();

    expect(err).toBeInstanceOf(InvalidFileContentError);
    expect(err).toBeInstanceOf(AssetDedupCoreError);
    expect(err.name).toBe('InvalidFileContentError');
    expect(err.message).toBe(expected);
  });
});

describe('UnknownRecipeError', () => {
  it('unknownRecipe() quotes the offending recipe in the message', () => {
    const err = UnknownRecipeError.unknownRecipe('image.does-not-exist');

    expect(err).toBeInstanceOf(UnknownRecipeError);
    expect(err.name).toBe('UnknownRecipeError');
    expect(err.message).toBe('unknown recipe "image.does-not-exist"');
  });
});

describe('MimeMismatchError', () => {
  it('contentMismatch() names both the claimed and the sniffed mime', () => {
    const err = MimeMismatchError.contentMismatch('image/jpeg', 'application/x-msdownload');

    expect(err).toBeInstanceOf(MimeMismatchError);
    expect(err.name).toBe('MimeMismatchError');
    expect(err.message).toBe(
      'claimed mime "image/jpeg" does not match the mime detected from the file\'s content ("application/x-msdownload")',
    );
  });

  it('missingFileExtension() names the extensionless file path', () => {
    const err = MimeMismatchError.missingFileExtension('/tmp/asset');

    expect(err.message).toBe('cannot determine a mime hint — "/tmp/asset" has no file extension');
  });
});

describe('AssetStorageError', () => {
  it.each([
    {
      name: 'persistFailed() reports the underlying cause message',
      build: (cause: Error): AssetStorageError => AssetStorageError.persistFailed(cause),
      expected: (message: string): string => `failed to persist asset to shared workdir: ${message}`,
    },
    {
      name: 'cleanupFailed() reports the workdir and the underlying cause message',
      build: (cause: Error): AssetStorageError => AssetStorageError.cleanupFailed('/var/assets/abc', cause),
      expected: (message: string): string => `failed to clean up asset workdir "/var/assets/abc": ${message}`,
    },
  ])('$name', ({ build, expected }) => {
    const cause = new Error('disk full');
    const err = build(cause);

    expect(err).toBeInstanceOf(AssetStorageError);
    expect(err.name).toBe('AssetStorageError');
    expect(err.message).toBe(expected(cause.message));
    expect(err.cause).toBe(cause);
  });
});

describe('SubserviceUnavailableError', () => {
  it('missingSocketPath() names the unconfigured subservice', () => {
    const err = SubserviceUnavailableError.missingSocketPath('image-hash');

    expect(err).toBeInstanceOf(SubserviceUnavailableError);
    expect(err.name).toBe('SubserviceUnavailableError');
    expect(err.message).toBe('no socket_path configured for subservice "image-hash"');
  });

  it("socketError() includes the subservice name and the cause's message, preserving the cause", () => {
    const cause = new Error('ENOENT');
    const err = SubserviceUnavailableError.socketError('image-hash', cause);

    expect(err.message).toBe('subservice "image-hash" socket error: ENOENT');
    expect(err.cause).toBe(cause);
  });

  it('clientClosed() names the subservice', () => {
    const err = SubserviceUnavailableError.clientClosed('image-hash');

    expect(err.message).toBe('subservice "image-hash" client closed');
  });

  it.each([
    {
      name: 'stringifies an Error via its default toString() form',
      err: new Error('ENOENT'),
      expected: 'Error: ENOENT',
    },
    {
      name: 'stringifies a non-Error value directly',
      err: 'a plain string rejection',
      expected: 'a plain string rejection',
    },
  ])('unknownConnectFailure() $name', ({ err: connectErr, expected }) => {
    const err = SubserviceUnavailableError.unknownConnectFailure(connectErr);

    expect(err.message).toBe(expected);
  });

  it('callTimedOut() names the subservice and the configured timeout', () => {
    const err = SubserviceUnavailableError.callTimedOut('image-hash', 30000);

    expect(err.message).toBe('subservice "image-hash" call timed out after 30000ms');
  });

  it("writeFailed() includes the subservice name and the cause's message, preserving the cause", () => {
    const cause = new Error('EPIPE');
    const err = SubserviceUnavailableError.writeFailed('image-hash', cause);

    expect(err.message).toBe('subservice "image-hash" write failed: EPIPE');
    expect(err.cause).toBe(cause);
  });

  it('connectionDropped() names the subservice', () => {
    const err = SubserviceUnavailableError.connectionDropped('image-hash');

    expect(err.message).toBe('subservice "image-hash" connection dropped');
  });
});

describe('PipelineExecutionError', () => {
  it.each([
    {
      name: 'mimeGroupUnresolved() reports the missing "*" fallback and names the mime',
      build: (): PipelineExecutionError => PipelineExecutionError.mimeGroupUnresolved('image/jpeg'),
      expectedMessage: 'no mime group could be resolved for mime "image/jpeg" (missing "*" fallback in config)',
    },
    {
      name: 'recipeNotConfigured() quotes the offending recipe',
      build: (): PipelineExecutionError => PipelineExecutionError.recipeNotConfigured('image.phash'),
      expectedMessage: 'recipe "image.phash" is not configured',
    },
    {
      name: 'noDefaultRecipeForFallbackGroup() names the fallback group',
      build: (): PipelineExecutionError => PipelineExecutionError.noDefaultRecipeForFallbackGroup('binary'),
      expectedMessage: 'no default recipe configured for fallback group "binary"',
    },
    {
      name: 'noPipelineForMimeGroup() names the mime group',
      build: (): PipelineExecutionError => PipelineExecutionError.noPipelineForMimeGroup('image'),
      expectedMessage: 'no pipeline configured for mime group "image"',
    },
    {
      name: 'algorithmNotConfigured() names the algorithm',
      build: (): PipelineExecutionError => PipelineExecutionError.algorithmNotConfigured('phash16'),
      expectedMessage: 'algorithm "phash16" is not configured',
    },
    {
      name: 'extractorNotConfigured() names the extractor',
      build: (): PipelineExecutionError => PipelineExecutionError.extractorNotConfigured('video-frames'),
      expectedMessage: 'extractor "video-frames" is not configured',
    },
    {
      name: 'extractorMissingPaths() names the extractor',
      build: (): PipelineExecutionError => PipelineExecutionError.extractorMissingPaths('video-frames'),
      expectedMessage: 'extractor "video-frames" response is missing "paths"',
    },
    {
      name: 'missingOutputForId() names the missing output id',
      build: (): PipelineExecutionError => PipelineExecutionError.missingOutputForId('0'),
      expectedMessage: 'subservice response is missing output for id "0"',
    },
    {
      name: 'subserviceReportedItemError() includes the id, error code, and error message',
      build: (): PipelineExecutionError =>
        PipelineExecutionError.subserviceReportedItemError('0', 'corrupt_input', 'corrupt image'),
      expectedMessage: 'subservice reported an error for id "0": [corrupt_input] corrupt image',
    },
    {
      name: 'mixedOrMissingOutputs() names the recipe',
      build: (): PipelineExecutionError => PipelineExecutionError.mixedOrMissingOutputs('image.phash16'),
      expectedMessage: 'recipe "image.phash16" produced a mix of hash/vector or missing outputs',
    },
    {
      name: 'poolingMissingVector() names the recipe',
      build: (): PipelineExecutionError => PipelineExecutionError.poolingMissingVector('video.clip'),
      expectedMessage: 'recipe "video.clip" has pooling: mean but a sub-item has no vector',
    },
  ])('$name', ({ build, expectedMessage }) => {
    const err = build();

    expect(err).toBeInstanceOf(PipelineExecutionError);
    expect(err.name).toBe('PipelineExecutionError');
    expect(err.message).toBe(expectedMessage);
  });

  describe('stepFailed()', () => {
    it.each([
      {
        name: "uses an Error cause's own message",
        cause: new Error('socket exploded'),
        expected: 'step for recipe "image.phash" failed: socket exploded',
      },
      {
        name: 'falls back to String() for a non-Error cause',
        cause: 'a plain string rejection',
        expected: 'step for recipe "image.phash" failed: a plain string rejection',
      },
    ])('$name', ({ cause, expected }) => {
      const err = PipelineExecutionError.stepFailed('image.phash', cause);

      expect(err.message).toBe(expected);
      expect(err.cause).toBe(cause);
    });
  });
});
