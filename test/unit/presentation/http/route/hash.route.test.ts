import { describe, it, expect } from 'vitest';
import { decodeFileContent } from '../../../../../src/presentation/http/route/hash.route.js';
import { InvalidFileContentError } from '../../../../../src/domain/errors.js';

describe('decodeFileContent', () => {
  it('decodes valid base64 to a Buffer', () => {
    const buffer = decodeFileContent(Buffer.from('hello').toString('base64'));

    expect(buffer).toEqual(Buffer.from('hello'));
  });

  it.each([
    [
      'an empty string — unreachable through the HTTP schema (minLength: 1), kept as a defensive check',
      '',
      /must not be empty/,
    ],
    ['a non-empty string that is not valid base64', 'not-valid-base64!!', /is not valid base64/],
    ['a base64-charset string whose length is not a multiple of 4', 'abc', undefined],
  ])('rejects %s', (_name, input, messagePattern) => {
    expect(() => decodeFileContent(input)).toThrow(InvalidFileContentError);
    if (messagePattern) {
      expect(() => decodeFileContent(input)).toThrow(messagePattern);
    }
  });
});
