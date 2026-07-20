/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { fileTypeFromBuffer } from 'file-type';
import mime from 'mime';
import type { MimeDetector } from '../../domain/provider/mime.provider.js';

export class FileTypeMimeDetector implements MimeDetector {
  async detectFromBuffer(buffer: Buffer): Promise<string | undefined> {
    const result = await fileTypeFromBuffer(buffer);

    return result?.mime;
  }

  detectFromExtension(extension: string): string | undefined {
    return mime.getType(extension) ?? undefined;
  }
}
