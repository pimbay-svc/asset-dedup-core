/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export interface SubserviceInputItem {
  path: string;
}

/** Per-item failure shape, per the extensions' own API contract (`docs/api.md`, "Error format"). */
export interface SubserviceOutputError {
  code: string;
  message: string;
}

/**
 * One batch-response item. Algorithm subservices return `hash`/`vector`; extractors return
 * `paths`. Any item `error` aborts the whole asset's pipeline — spec §5.
 */
export interface SubserviceOutputItem {
  hash?: string;
  vector?: number[];
  paths?: string[];
  error?: SubserviceOutputError;
}

/**
 * Dispatch field: `"hash"` for algorithm subservices, `"extract"` for extractors.
 * Unrecognized `op` gets no response frame.
 */
export const SubserviceOp = {
  HASH: 'hash',
  EXTRACT: 'extract',
} as const;
export type SubserviceOp = (typeof SubserviceOp)[keyof typeof SubserviceOp];

export interface SubserviceBatchParams {
  subservice: string;
  op: SubserviceOp;
  config: Record<string, unknown>;
  inputs: Record<string, SubserviceInputItem>;
}

export interface SubserviceRunner {
  /** Connects once and keeps the connection open — called at startup per spec §3. */
  verifyReachable: (subservice: string) => Promise<boolean>;
  /** Every call is a batch call, even for a single item — spec §5. */
  batch: (params: SubserviceBatchParams) => Promise<Record<string, SubserviceOutputItem>>;
  close: () => Promise<void>;
}
