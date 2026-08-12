/**
 * Sample slipstream-core outputs used by unit tests. These mirror the RAW
 * engine JSON shapes (source_name + StaticKey arrays) so the adapter's
 * normalization is genuinely exercised.
 */

export const RAW_SCAN_JSON = JSON.stringify([
  {
    source_name: 'counter.rs',
    functions: [
      {
        function_name: 'increment',
        storage_reads: [{ segments: ['count'] }],
        storage_writes: [{ segments: ['count'] }],
      },
      {
        function_name: 'reset',
        storage_reads: [],
        storage_writes: [{ segments: ['count'] }],
      },
    ],
    detectors: [
      {
        detector: 'global-static-write',
        function: null,
        key: 'count',
        message: 'static key `count` is written from multiple functions',
      },
      {
        detector: 'read-modify-write',
        function: 'increment',
        key: 'count',
        message: 'read-modify-write on `count`',
      },
    ],
  },
]);

export const RAW_DIFF_JSON = JSON.stringify({
  left: { path: 'naive', detector_findings: 2, storage_reads: 1, storage_writes: 2 },
  right: { path: 'optimized', detector_findings: 1, storage_reads: 1, storage_writes: 1 },
  per_function_deltas: [{ function: 'increment', reads_delta: 0, writes_delta: -1 }],
  summary: {
    detector_findings_delta: -1,
    storage_reads_delta: 0,
    storage_writes_delta: -1,
  },
});

/** A real `slipstream profile --fixture <f> --json` payload. */
export const PROFILE_JSON_OUTPUT = JSON.stringify({
  source: 'sharded-counter workload',
  transaction_count: 6,
  distinct_keys: 5,
  stage_count: 2,
  parallelism: 3.0,
  critical_path_length: 2,
  weighted_critical_path_weight: 6,
  total_conflicts: 3,
  hot_keys: [
    {
      key: { ContractData: { contract_id: 'C1', key: 'shard:0' } },
      reads: 0,
      writes: 2,
      touch_count: 2,
    },
    {
      key: { ContractData: { contract_id: 'C1', key: 'state' } },
      reads: 2,
      writes: 0,
      touch_count: 2,
    },
  ],
  schedule: { stages: [{ txns: [0, 1, 2] }, { txns: [3, 4, 5] }] },
});
