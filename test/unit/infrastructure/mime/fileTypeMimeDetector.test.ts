import { describe, it, expect } from 'vitest';
import { FileTypeMimeDetector } from '../../../../src/infrastructure/mime/fileTypeMimeDetector.js';

// A real, minimal (1x1 transparent pixel) PNG — file-type needs more than just the 8-byte
// magic signature to positively identify a format, so a full minimal file is used here.
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('FileTypeMimeDetector.detectFromBuffer', () => {
  it('sniffs a known binary-signature mime from real content', async () => {
    const detector = new FileTypeMimeDetector();

    const mime = await detector.detectFromBuffer(MINIMAL_PNG);

    expect(mime).toBe('image/png');
  });

  it('returns undefined for content with no recognizable signature (e.g. plain text)', async () => {
    const detector = new FileTypeMimeDetector();

    const mime = await detector.detectFromBuffer(Buffer.from('just some plain text, not a real file format'));

    expect(mime).toBeUndefined();
  });
});

describe('FileTypeMimeDetector.detectFromExtension', () => {
  const detector = new FileTypeMimeDetector();

  it.each([
    ['jpg', 'image/jpeg'],
    ['pdf', 'application/pdf'],
    ['not-a-real-extension', undefined],
  ])('resolves extension "%s" to %s', (extension, expected) => {
    expect(detector.detectFromExtension(extension)).toBe(expected);
  });
});
