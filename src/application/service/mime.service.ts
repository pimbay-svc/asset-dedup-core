/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { Config } from '../../infrastructure/config/types.js';
import type { MimeDetector } from '../../domain/provider/mime.provider.js';
import { WILDCARD_MIME } from '../../domain/model/pipeline.model.js';
import { MimeMismatchError, PipelineExecutionError } from '../../domain/errors.js';

export interface MimeHint {
  type: 'mime' | 'extension';
  value: string;
}

export interface ResolvedMime {
  mime: string;
  mimeGroup: string;
}

/**
 * Resolves a caller-supplied mime hint to `{ mime, mimeGroup }`, verified against a content sniff wherever possible.
 * `type: "mime"` (HTTP) is a *claim* — a disagreeing sniff is a hard `MimeMismatchError`, never silently corrected.
 * `type: "extension"` (CLI) is only a *hint* — a disagreeing sniff silently overrides it instead.
 * Either way, an unsniffable format trusts the hint as-is.
 */
export class MimeService {
  constructor(
    private readonly config: Config,
    private readonly mimeDetector: MimeDetector,
  ) {}

  async resolve(hint: MimeHint, buffer: Buffer): Promise<ResolvedMime> {
    const mime = await (hint.type === 'mime'
      ? this.resolveFromMimeHint(hint.value, buffer)
      : this.resolveFromExtensionHint(hint.value, buffer));

    const mimeGroup = this.config.mime_to_group[mime] ?? this.config.mime_to_group[WILDCARD_MIME];

    // Unreachable — config.ts validates the mandatory "*" fallback at startup.
    // Stryker disable all : unreachable, see v8 ignore comment below
    /* v8 ignore next 3 */
    if (mimeGroup === undefined) {
      throw PipelineExecutionError.mimeGroupUnresolved(mime);
    }
    // Stryker restore all

    return { mime, mimeGroup };
  }

  private async resolveFromMimeHint(claimedMime: string, buffer: Buffer): Promise<string> {
    const sniffed = await this.mimeDetector.detectFromBuffer(buffer);

    if (sniffed !== undefined && sniffed !== claimedMime) {
      throw MimeMismatchError.contentMismatch(claimedMime, sniffed);
    }

    return claimedMime;
  }

  private async resolveFromExtensionHint(extension: string, buffer: Buffer): Promise<string> {
    const candidate = this.mimeDetector.detectFromExtension(extension);

    if (candidate === undefined) {
      // Unknown extension — nothing to compare a sniff against; falls through to the "*" group.
      // Returning WILDCARD_MIME here means `resolve()`'s returned `mime` isn't a real mime type
      // in this case — only `mimeGroup` is safe to rely on downstream.
      return WILDCARD_MIME;
    }
    if (!(candidate in this.config.mime_to_group)) {
      // Not a mime core has a pipeline opinion on — sniffing it wouldn't change the outcome
      // (it would resolve to the "*" group either way), so skip the extra work.
      return candidate;
    }

    const sniffed = await this.mimeDetector.detectFromBuffer(buffer);

    // Content wins when it disagrees; the extension was only ever a hint.
    return sniffed ?? candidate;
  }
}
