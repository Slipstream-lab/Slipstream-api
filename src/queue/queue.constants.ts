/** Shared queue constants. */
export const ANALYSIS_QUEUE = 'analysis';

/** The payload enqueued for an analysis job. */
export interface AnalysisJobData {
  /** The AnalysisJob row id this queue job corresponds to. */
  analysisJobId: string;
  /** The Contract row id. */
  contractId: string;
  /** Which core command to run. */
  kind: 'SCAN' | 'PROFILE' | 'DIFF';
  /** Path to scan (SCAN), or fixture (PROFILE). */
  path?: string;
  fixture?: string;
  /** Diff operands (DIFF). */
  left?: string;
  right?: string;
  /** Git ref / resolved commit the sources came from (reproducibility). */
  ref?: string;
  commitSha?: string;
}
