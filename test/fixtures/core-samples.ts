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

export const PROFILE_TEXT_OUTPUT = [
  'profile: sharded-counter workload',
  '  transactions:    6',
  '  distinct keys:   5',
  '  stages:          2',
  '  parallelism:     3.00',
  '  critical path:   2 txns',
  '  weighted crit.:  6 (read=1, write=2)',
  '  total conflicts: 3',
  '  hot keys:',
  '    contract:C1:shard:0                              reads=   0 writes=   2',
  '    contract:C1:state                                reads=   2 writes=   0',
].join('\n');
