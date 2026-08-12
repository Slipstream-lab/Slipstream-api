import { Test } from '@nestjs/testing';
import { CORE_RUNNER, CoreRunner } from '../../src/core/core-runner.interface';
import { CoreInvocationError, SlipstreamCoreService } from '../../src/core/slipstream-core.service';
import { MockCoreRunner } from '../../src/core/mock-core-runner';
import { PROFILE_TEXT_OUTPUT, RAW_DIFF_JSON, RAW_SCAN_JSON } from '../fixtures/core-samples';

async function buildService(runner: CoreRunner): Promise<SlipstreamCoreService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SlipstreamCoreService, { provide: CORE_RUNNER, useValue: runner }],
  }).compile();
  return moduleRef.get(SlipstreamCoreService);
}

describe('SlipstreamCoreService', () => {
  describe('scan()', () => {
    it('normalizes raw engine scan JSON (source_name + StaticKey) into the contract', async () => {
      const runner = new MockCoreRunner({
        scan: { stdout: RAW_SCAN_JSON, stderr: '', exitCode: 0 },
      });
      const service = await buildService(runner);

      const reports = await service.scan('/some/path');

      expect(reports).toHaveLength(1);
      const [report] = reports;
      // source_name -> source
      expect(report.source).toBe('counter.rs');
      // StaticKey { segments } -> joined string
      expect(report.functions[0].function_name).toBe('increment');
      expect(report.functions[0].storage_reads).toEqual(['count']);
      expect(report.functions[0].storage_writes).toEqual(['count']);
      expect(report.functions[1].storage_reads).toEqual([]);
      // detectors pass through
      expect(report.detectors.map((d) => d.detector)).toEqual([
        'global-static-write',
        'read-modify-write',
      ]);
    });

    it('joins multi-segment StaticKeys with a dot', async () => {
      const raw = JSON.stringify([
        {
          source_name: 'x.rs',
          functions: [
            {
              function_name: 'f',
              storage_reads: [{ segments: ['DataKey', 'Owner'] }],
              storage_writes: [],
            },
          ],
          detectors: [],
        },
      ]);
      const service = await buildService(
        new MockCoreRunner({ scan: { stdout: raw, stderr: '', exitCode: 0 } }),
      );
      const reports = await service.scan('.');
      expect(reports[0].functions[0].storage_reads).toEqual(['DataKey.Owner']);
    });

    it('throws CoreInvocationError on non-zero exit', async () => {
      const service = await buildService(
        new MockCoreRunner({
          scan: { stdout: '', stderr: 'boom', exitCode: 1 },
        }),
      );
      await expect(service.scan('.')).rejects.toBeInstanceOf(CoreInvocationError);
    });

    it('throws CoreInvocationError on invalid JSON', async () => {
      const service = await buildService(
        new MockCoreRunner({
          scan: { stdout: 'not json', stderr: '', exitCode: 0 },
        }),
      );
      await expect(service.scan('.')).rejects.toBeInstanceOf(CoreInvocationError);
    });
  });

  describe('diff()', () => {
    it('parses diff JSON and preserves per-function deltas and summary', async () => {
      const service = await buildService(
        new MockCoreRunner({
          diff: { stdout: RAW_DIFF_JSON, stderr: '', exitCode: 0 },
        }),
      );
      const diff = await service.diff('naive', 'optimized');
      expect(diff.summary.detector_findings_delta).toBe(-1);
      expect(diff.summary.storage_writes_delta).toBe(-1);
      expect(diff.per_function_deltas).toEqual([
        { function: 'increment', reads_delta: 0, writes_delta: -1 },
      ]);
    });
  });

  describe('profile()', () => {
    it('parses the human-readable profile output into a ProfileReport', async () => {
      const service = await buildService(
        new MockCoreRunner({
          profile: { stdout: PROFILE_TEXT_OUTPUT, stderr: '', exitCode: 0 },
        }),
      );
      const report = await service.profile('fixtures/x.json');
      expect(report.source).toBe('sharded-counter workload');
      expect(report.transaction_count).toBe(6);
      expect(report.distinct_keys).toBe(5);
      expect(report.stage_count).toBe(2);
      expect(report.parallelism).toBeCloseTo(3.0);
      expect(report.critical_path_length).toBe(2);
      expect(report.weighted_critical_path_weight).toBe(6);
      expect(report.total_conflicts).toBe(3);
      expect(report.hot_keys).toHaveLength(2);
      expect(report.hot_keys[0]).toEqual({
        key: 'contract:C1:shard:0',
        reads: 0,
        writes: 2,
        touch_count: 2,
      });
    });
  });

  describe('default MockCoreRunner responses', () => {
    it('returns canned scan/diff/profile without any overrides', async () => {
      const service = await buildService(new MockCoreRunner());
      await expect(service.scan('.')).resolves.toHaveLength(1);
      await expect(service.diff('a', 'b')).resolves.toHaveProperty('summary');
      await expect(service.profile('f')).resolves.toHaveProperty('hot_keys');
    });
  });
});
