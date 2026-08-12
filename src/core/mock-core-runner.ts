import { CoreCommandResult, CoreRunner } from './core-runner.interface';

/**
 * A deterministic in-memory {@link CoreRunner} for tests and for booting the
 * app without the real binary. It returns canned stdout keyed by the first
 * argument (the subcommand). Responses are the *raw* engine JSON shapes so
 * that {@link SlipstreamCoreService}'s normalization is exercised for real.
 *
 * Custom responses can be injected via the constructor to simulate failures,
 * empty output, malformed JSON, etc.
 */
export class MockCoreRunner implements CoreRunner {
  constructor(private readonly responses: Partial<Record<string, CoreCommandResult>> = {}) {}

  run(args: string[]): Promise<CoreCommandResult> {
    const subcommand = args[0] ?? '';
    const override = this.responses[subcommand];
    if (override) {
      return Promise.resolve(override);
    }
    switch (subcommand) {
      case 'scan':
        return Promise.resolve(ok(JSON.stringify(RAW_SCAN)));
      case 'profile':
        return Promise.resolve(ok(JSON.stringify(RAW_PROFILE)));
      case 'diff':
        return Promise.resolve(ok(JSON.stringify(RAW_DIFF)));
      default:
        return Promise.resolve({
          stdout: '',
          stderr: `unknown subcommand: ${subcommand}`,
          exitCode: 2,
        });
    }
  }
}

function ok(stdout: string): CoreCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

/**
 * Raw `scan --json` output as the Rust engine actually serializes it:
 * `source_name`, and `storage_reads`/`storage_writes` as arrays of
 * `{ segments }` StaticKey objects. Modelled on the global-counter sample in
 * the slipstream-core CLI tests.
 */
export const RAW_SCAN = [
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
        message:
          'static key `count` is written from multiple functions (increment, reset); a global contention point that serializes concurrent access',
      },
      {
        detector: 'read-modify-write',
        function: 'increment',
        key: 'count',
        message:
          'function `increment` reads and writes key `count` (read-modify-write serializes access)',
      },
    ],
  },
];

/**
 * Raw `diff --json` output, matching the CLI's `print_diff_json` shape.
 */
export const RAW_DIFF = {
  left: {
    path: 'naive',
    files: 1,
    functions: 2,
    storage_reads: 1,
    storage_writes: 2,
    detector_findings: 2,
    detectors: { 'global-static-write': 1, 'read-modify-write': 1 },
  },
  right: {
    path: 'optimized',
    files: 1,
    functions: 1,
    storage_reads: 1,
    storage_writes: 1,
    detector_findings: 1,
    detectors: { 'read-modify-write': 1 },
  },
  per_function_deltas: [
    { function: 'increment', reads_delta: 0, writes_delta: -1 },
    { function: 'reset', reads_delta: 0, writes_delta: -1 },
  ],
  summary: {
    detector_findings_delta: -1,
    storage_reads_delta: 0,
    storage_writes_delta: -1,
  },
};

/**
 * `profile --json` output, matching the engine's serialized `ProfileReport`
 * (metrics + the full `schedule`; `hot_keys[].key` is a structured
 * `LedgerKey`). Modelled on the sharded-counter fixture.
 */
export const RAW_PROFILE = {
  source: 'illustrative fixture: sharded-counter workload',
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
  schedule: {
    stages: [{ txns: [0, 1, 2] }, { txns: [3, 4, 5] }],
  },
};
