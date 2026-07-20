/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export interface MimeDetector {
  detectFromBuffer: (buffer: Buffer) => Promise<string | undefined>;
  detectFromExtension: (extension: string) => string | undefined;
}
