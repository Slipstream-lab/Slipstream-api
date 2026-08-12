import { AnalysisReport, ProfileReport } from '../../src/core/core.types';
import {
  gradeFromProfile,
  gradeFromScan,
  interpretDiff,
  letterForScore,
} from '../../src/modules/analysis/grade';
import { DiffReport } from '../../src/core/core.types';

function scanReport(
  detectors: AnalysisReport['detectors'],
  functions: AnalysisReport['functions'] = [],
): AnalysisReport {
  return { source: 'x.rs', functions, detectors };
}

describe('grade computation', () => {
  describe('letterForScore', () => {
    it.each([
      [95, 'A'],
      [90, 'A'],
      [85, 'B'],
      [72, 'C'],
      [61, 'D'],
      [50, 'F'],
      [0, 'F'],
    ])('maps %i -> %s', (score, letter) => {
      expect(letterForScore(score)).toBe(letter);
    });
  });

  describe('gradeFromScan', () => {
    it('gives a clean contract a perfect score', () => {
      const grade = gradeFromScan([scanReport([])]);
      expect(grade.score).toBe(100);
      expect(grade.letter).toBe('A');
    });

    it('deducts weighted penalties per detector', () => {
      const grade = gradeFromScan([
        scanReport([
          {
            detector: 'global-static-write',
            function: null,
            key: 'count',
            message: '',
          },
          {
            detector: 'read-modify-write',
            function: 'f',
            key: 'count',
            message: '',
          },
        ]),
      ]);
      // 100 - 15 - 8 = 77
      expect(grade.score).toBe(77);
      expect(grade.letter).toBe('C');
    });

    it('penalizes write amplification within a function', () => {
      const grade = gradeFromScan([
        scanReport(
          [],
          [
            {
              function_name: 'f',
              storage_reads: [],
              storage_writes: ['a', 'b', 'c'],
            },
          ],
        ),
      ]);
      // 100 - (3-1)*1.5 = 97
      expect(grade.score).toBe(97);
    });

    it('never goes below 0', () => {
      const many = Array.from({ length: 20 }, () => ({
        detector: 'global-static-write',
        function: null,
        key: 'k',
        message: '',
      }));
      const grade = gradeFromScan([scanReport(many)]);
      expect(grade.score).toBe(0);
      expect(grade.letter).toBe('F');
    });
  });

  describe('gradeFromProfile', () => {
    const base: ProfileReport = {
      source: 's',
      transaction_count: 0,
      distinct_keys: 0,
      stage_count: 0,
      parallelism: 0,
      critical_path_length: 0,
      weighted_critical_path_weight: 0,
      total_conflicts: 0,
      hot_keys: [],
      schedule: null,
    };

    it('grades an empty set as perfect', () => {
      expect(gradeFromProfile(base).score).toBe(100);
    });

    it('rewards high parallelism with no conflicts', () => {
      const grade = gradeFromProfile({
        ...base,
        transaction_count: 10,
        parallelism: 10,
        total_conflicts: 0,
      });
      expect(grade.score).toBe(100);
    });

    it('penalizes low parallelism and conflicts', () => {
      const grade = gradeFromProfile({
        ...base,
        transaction_count: 10,
        parallelism: 2,
        total_conflicts: 20,
      });
      // ratio 0.2 -> 20; conflictRate 2 -> -min(20,40)=-20 -> 0
      expect(grade.score).toBeLessThan(30);
    });
  });

  describe('interpretDiff', () => {
    it('flags a reduction in findings as an improvement', () => {
      const diff: DiffReport = {
        left: {},
        right: {},
        per_function_deltas: [],
        summary: {
          detector_findings_delta: -2,
          storage_reads_delta: 0,
          storage_writes_delta: -1,
        },
      };
      expect(interpretDiff(diff)).toEqual({ improved: true, findingsDelta: -2 });
    });

    it('does not flag an increase as improvement', () => {
      const diff: DiffReport = {
        left: {},
        right: {},
        per_function_deltas: [],
        summary: {
          detector_findings_delta: 3,
          storage_reads_delta: 0,
          storage_writes_delta: 0,
        },
      };
      expect(interpretDiff(diff).improved).toBe(false);
    });
  });
});
