/**
 * TypeScript models of the slipstream-core JSON contract.
 *
 * IMPORTANT — contract fidelity note:
 * The task specifies a *normalized* shape (`AnalysisReport.source`,
 * `functions[].storage_reads: string[]`). The real Rust engine
 * (slipstream-core, sibling repo) actually serializes `scan --json` with
 * slightly different field names:
 *   - `source_name` (not `source`)
 *   - `storage_reads` / `storage_writes` are arrays of `StaticKey`
 *     objects (`{ segments: string[] }`), not plain strings.
 *
 * The {@link SlipstreamCoreService} adapter is responsible for accepting the
 * raw engine shape and normalizing it to the types below, so the rest of the
 * API only ever sees the clean, documented contract. See
 * `slipstream-core.service.ts` for the normalization logic.
 */

/** Known static-analysis detector names emitted by `slipstream scan`. */
export const DETECTOR_NAMES = [
  'global-static-write',
  'write-in-loop',
  'read-modify-write',
  'duplicate-read',
] as const;

export type DetectorName = (typeof DETECTOR_NAMES)[number];

/** A single detector finding (normalized). */
export interface DetectorFinding {
  detector: string;
  function: string | null;
  key: string | null;
  message: string;
}

/** Per-function inferred storage access (normalized). */
export interface FunctionAccess {
  function_name: string;
  storage_reads: string[];
  storage_writes: string[];
}

/** The result of statically analyzing one source file (normalized). */
export interface AnalysisReport {
  source: string;
  functions: FunctionAccess[];
  detectors: DetectorFinding[];
}

/** A hot key and its access profile from `slipstream profile`. */
export interface HotKey {
  /** The engine serializes the key as a structured `LedgerKey` enum object. */
  key: LedgerKey;
  reads: number;
  writes: number;
  touch_count: number;
}

/**
 * A ledger key as serialized by the engine (externally-tagged enum). Only the
 * variants the engine emits are enumerated; unknown variants fall through to a
 * raw record so forward-compatibility never breaks parsing.
 */
export type LedgerKey =
  | { Account: { account_id: string } }
  | { TrustLine: { account_id: string; asset: string } }
  | { ContractData: { contract_id: string; key: string } }
  | { ContractCode: { contract_id: string } }
  | { ContractTtl: { contract_id: string } }
  | { Other: string }
  | Record<string, unknown>;

/** One scheduling stage: the transactions (by index) that run in parallel. */
export interface Cluster {
  txns: number[];
}

/** The full schedule: an ordered list of stages. */
export interface Schedule {
  stages: Cluster[];
}

/**
 * Renders a {@link LedgerKey} to a stable string, mirroring the engine's
 * `Display` formatting. Used when a structured key must be stored/displayed as
 * text (e.g. a `HotKey.key` persisted to a string column).
 */
export function renderLedgerKey(key: LedgerKey): string {
  const k = key as Record<string, unknown>;
  if ('Account' in k) {
    return `account:${(k.Account as { account_id: string }).account_id}`;
  }
  if ('TrustLine' in k) {
    const t = k.TrustLine as { account_id: string; asset: string };
    return `trustline:${t.account_id}:${t.asset}`;
  }
  if ('ContractData' in k) {
    const c = k.ContractData as { contract_id: string; key: string };
    return `contract:${c.contract_id}:${c.key}`;
  }
  if ('ContractCode' in k) {
    return `code:${(k.ContractCode as { contract_id: string }).contract_id}`;
  }
  if ('ContractTtl' in k) {
    return `ttl:${(k.ContractTtl as { contract_id: string }).contract_id}`;
  }
  if ('Other' in k) {
    return `other:${String(k.Other)}`;
  }
  return JSON.stringify(key);
}

/** The result of `slipstream profile --fixture <f> --json`. */
export interface ProfileReport {
  source: string;
  transaction_count: number;
  distinct_keys: number;
  stage_count: number;
  parallelism: number;
  critical_path_length: number;
  weighted_critical_path_weight: number;
  total_conflicts: number;
  hot_keys: HotKey[];
  /** Full schedule, for inspection and visualization. */
  schedule: Schedule;
}

/** A per-function delta from `slipstream diff`. */
export interface PerFunctionDelta {
  function: string;
  reads_delta: number;
  writes_delta: number;
}

/** Summary deltas from `slipstream diff`. */
export interface DiffSummary {
  detector_findings_delta: number;
  storage_reads_delta: number;
  storage_writes_delta: number;
}

/** The result of `slipstream diff <l> <r> --json` (normalized). */
export interface DiffReport {
  left: unknown;
  right: unknown;
  per_function_deltas: PerFunctionDelta[];
  summary: DiffSummary;
}

// ---------------------------------------------------------------------------
// Raw engine shapes (as actually serialized by the Rust binary). These are
// only used internally by the adapter for normalization.
// ---------------------------------------------------------------------------

/** Raw `StaticKey` as serialized by slipstream-core. */
export interface RawStaticKey {
  segments: string[];
}

/** Raw per-function access as serialized by slipstream-core. */
export interface RawFunctionAccess {
  function_name: string;
  storage_reads: RawStaticKey[];
  storage_writes: RawStaticKey[];
}

/** Raw `AnalysisReport` as serialized by slipstream-core `scan --json`. */
export interface RawAnalysisReport {
  source_name: string;
  functions: RawFunctionAccess[];
  detectors: DetectorFinding[];
}
