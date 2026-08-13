import { AnalysisReport, DiffReport, ProfileReport } from '../../core/core.types';

/** A computed grade: a letter A–F plus a numeric 0–100 score. */
export interface ComputedGrade {
  letter: string;
  /** 0–100, higher = less contentious / better parallelism. */
  score: number;
}

/**
 * Weights for the scan-based grade penalties. Exposed for testing and tuning.
 * Each detector finding and each excess storage write reduces the score.
 */
export const GRADE_WEIGHTS = {
  /** Points deducted per detector finding, by detector severity. */
  detectorPenalty: {
    'global-static-write': 15,
    'write-in-loop': 12,
    'read-modify-write': 8,
    'duplicate-read': 4,
    default: 6,
  } as Record<string, number>,
  /** Points deducted per storage write beyond the first per function. */
  excessWritePenalty: 1.5,
};

/**
 * The single source of truth for the score→letter mapping. Tests assert
 * `letterForScore` against this table, and the README reproduces it verbatim
 * so `slipstream-web/lib/grade.ts` can be kept in sync deliberately.
 */
export const GRADE_THRESHOLDS = [
  { min: 90, letter: 'A', label: 'Excellent' },
  { min: 80, letter: 'B', label: 'Good' },
  { min: 70, letter: 'C', label: 'Fair' },
  { min: 60, letter: 'D', label: 'Poor' },
  { min: 0, letter: 'F', label: 'Failing' },
] as const;

/** Maps a 0–100 numeric score to a letter grade (driven by GRADE_THRESHOLDS). */
export function letterForScore(score: number): string {
  const clamped = clamp(score, 0, 100);
  const bucket = GRADE_THRESHOLDS.find((t) => clamped >= t.min);
  return bucket?.letter ?? 'F';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Computes a grade from static-analysis (`scan`) reports.
 *
 * Starts at 100 and deducts weighted penalties for detector findings and for
 * write amplification (multiple writes within a single function). Fully
 * deterministic and pure.
 */
export function gradeFromScan(reports: AnalysisReport[]): ComputedGrade {
  let score = 100;

  for (const report of reports) {
    for (const finding of report.detectors) {
      const penalty =
        GRADE_WEIGHTS.detectorPenalty[finding.detector] ?? GRADE_WEIGHTS.detectorPenalty.default;
      score -= penalty;
    }
    for (const fn of report.functions) {
      const excessWrites = Math.max(0, fn.storage_writes.length - 1);
      score -= excessWrites * GRADE_WEIGHTS.excessWritePenalty;
    }
  }

  score = clamp(Math.round(score), 0, 100);
  return { letter: letterForScore(score), score };
}

/**
 * Computes a grade from a profile report. Parallelism is the headline signal:
 * a schedule that packs many transactions per stage (high parallelism, few
 * stages, few conflicts) scores well.
 */
export function gradeFromProfile(profile: ProfileReport): ComputedGrade {
  if (profile.transaction_count === 0) {
    return { letter: 'A', score: 100 };
  }

  // Ideal parallelism is "all txns in one stage" = transaction_count.
  // Ratio of achieved parallelism to transaction_count, scaled to 100.
  const ratio = clamp(profile.parallelism / profile.transaction_count, 0, 1);
  let score = ratio * 100;

  // Penalize conflicts relative to transaction count.
  const conflictRate = profile.total_conflicts / profile.transaction_count;
  score -= clamp(conflictRate * 10, 0, 40);

  score = clamp(Math.round(score), 0, 100);
  return { letter: letterForScore(score), score };
}

/**
 * Interprets a diff: a negative `detector_findings_delta` (fewer findings on
 * the right/optimized side) is an improvement. Returns the delta and a simple
 * verdict for convenience.
 */
export function interpretDiff(diff: DiffReport): {
  improved: boolean;
  findingsDelta: number;
} {
  const findingsDelta = diff.summary.detector_findings_delta;
  return { improved: findingsDelta < 0, findingsDelta };
}
