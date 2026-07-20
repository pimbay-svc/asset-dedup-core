import { describe, it, expect, vi } from 'vitest';
import { MimeService } from '../../../../src/application/service/mime.service.js';
import { MimeMismatchError } from '../../../../src/domain/errors.js';
import type { Config } from '../../../../src/infrastructure/config/types.js';
import type { MimeDetector } from '../../../../src/domain/provider/mime.provider.js';

const CONFIG: Config = {
  mime_to_group: { 'image/jpeg': 'image', 'video/mp4': 'video', '*': 'binary' },
  algorithms: { sha256: { kind: 'native', comparison: 'exact' } },
  extractors: {},
  subservices: {},
  pipelines: { binary: { sha256: { algorithm: 'sha256' } }, image: { sha256: { algorithm: 'sha256' } } },
};

function makeDetector(overrides: Partial<MimeDetector> = {}): MimeDetector {
  return {
    detectFromBuffer: vi.fn(() => Promise.resolve(undefined)),
    detectFromExtension: vi.fn(() => undefined),
    ...overrides,
  };
}

const BUFFER = Buffer.from('irrelevant');

describe('MimeService.resolve — type: "mime" (HTTP claim)', () => {
  it.each([
    [
      'trusts the claimed mime when the content sniff agrees',
      Promise.resolve('image/jpeg'),
      'image/jpeg',
      { mime: 'image/jpeg', mimeGroup: 'image' },
    ],
    [
      'trusts the claimed mime when the content sniff is undecidable',
      Promise.resolve(undefined),
      'image/jpeg',
      { mime: 'image/jpeg', mimeGroup: 'image' },
    ],
    [
      'falls back to the wildcard group when the claimed mime has no direct group mapping',
      Promise.resolve(undefined),
      'application/x-totally-unknown',
      { mime: 'application/x-totally-unknown', mimeGroup: 'binary' },
    ],
  ])('%s', async (_name, sniffResult, claimedMime, expected) => {
    const detector = makeDetector({ detectFromBuffer: vi.fn(() => sniffResult) });
    const service = new MimeService(CONFIG, detector);

    const result = await service.resolve({ type: 'mime', value: claimedMime }, BUFFER);

    expect(result).toEqual(expected);
  });

  it('throws MimeMismatchError when the content sniff disagrees with the claim', async () => {
    const detector = makeDetector({ detectFromBuffer: vi.fn(() => Promise.resolve('application/x-msdownload')) });
    const service = new MimeService(CONFIG, detector);

    await expect(service.resolve({ type: 'mime', value: 'image/jpeg' }, BUFFER)).rejects.toThrow(MimeMismatchError);
    await expect(service.resolve({ type: 'mime', value: 'image/jpeg' }, BUFFER)).rejects.toThrow(
      /does not match the mime detected from the file's content \("application\/x-msdownload"\)/,
    );
  });
});

describe('MimeService.resolve — type: "extension" (CLI hint)', () => {
  it.each([
    [
      'falls back to the wildcard mime when the extension is unknown to the detector',
      undefined,
      undefined,
      'weirdext',
      { mime: '*', mimeGroup: 'binary' },
      true,
    ],
    [
      'skips content sniffing when the extension-derived mime has no pipeline group opinion',
      'text/plain',
      undefined,
      'txt',
      { mime: 'text/plain', mimeGroup: 'binary' },
      true,
    ],
    [
      'trusts the extension-derived candidate when the content sniff is undecidable',
      'image/jpeg',
      undefined,
      'jpg',
      { mime: 'image/jpeg', mimeGroup: 'image' },
      false,
    ],
    [
      'lets a disagreeing content sniff override the extension-derived candidate',
      'image/jpeg',
      'video/mp4',
      'jpg',
      { mime: 'video/mp4', mimeGroup: 'video' },
      false,
    ],
  ])('%s', async (_name, extensionCandidate, sniffed, extension, expected, expectSniffSkipped) => {
    const detector = makeDetector({
      detectFromExtension: vi.fn(() => extensionCandidate),
      detectFromBuffer: vi.fn(() => Promise.resolve(sniffed)),
    });
    const service = new MimeService(CONFIG, detector);

    const result = await service.resolve({ type: 'extension', value: extension }, BUFFER);

    expect(result).toEqual(expected);
    if (expectSniffSkipped) {
      // Nothing to verify a sniff against, or no pipeline opinion — content sniffing is skipped entirely.
      expect(detector.detectFromBuffer).not.toHaveBeenCalled();
    }
  });
});
