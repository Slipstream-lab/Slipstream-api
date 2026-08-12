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
  key: string;
  reads: number;
  writes: number;
  touch_count: number;
}

/** The result of `slipstream profile --fixture <f>` (normalized). */
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
  /** Full schedule (opaque here; retained for inspection/visualization). */
  schedule: unknown;
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
