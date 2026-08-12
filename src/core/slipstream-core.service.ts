import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORE_RUNNER, CoreRunner } from './core-runner.interface';
import { AnalysisReport, DiffReport, HotKey, ProfileReport, RawAnalysisReport } from './core.types';

/** Raised when a core invocation fails or returns unparseable output. */
export class CoreInvocationError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'CoreInvocationError';
  }
}

/**
 * High-level, typed facade over the slipstream-core CLI. Delegates process
 * execution to a {@link CoreRunner} and normalizes the raw engine output into
 * the documented {@link AnalysisReport} / {@link ProfileReport} /
 * {@link DiffReport} contract (see core.types.ts for the fidelity note).
 */
@Injectable()
export class SlipstreamCoreService {
  private readonly logger = new Logger(SlipstreamCoreService.name);

  constructor(@Inject(CORE_RUNNER) private readonly runner: CoreRunner) {}

  /** `slipstream scan <path> --json` → normalized reports. */
  async scan(path: string): Promise<AnalysisReport[]> {
    const { stdout } = await this.exec(['scan', path, '--json']);
    const raw = this.parseJson<RawAnalysisReport[]>(stdout, 'scan');
    return raw.map((r) => this.normalizeReport(r));
  }

  /**
   * `slipstream diff <left> <right> --json` → normalized diff. The engine's
   * diff JSON is already close to the target contract; we validate and pass it
   * through with typed structure.
   */
  async diff(left: string, right: string): Promise<DiffReport> {
    const { stdout } = await this.exec(['diff', left, right, '--json']);
    const raw = this.parseJson<DiffReport>(stdout, 'diff');
    return {
      left: raw.left,
      right: raw.right,
      per_function_deltas: raw.per_function_deltas ?? [],
      summary: raw.summary ?? {
        detector_findings_delta: 0,
        storage_reads_delta: 0,
        storage_writes_delta: 0,
      },
    };
  }

  /**
   * `slipstream profile --fixture <fixture>`.
   *
   * NOTE: the current CLI `profile` subcommand emits a human-readable summary,
   * not JSON (there is no `--json` flag yet). We parse that text into the
   * {@link ProfileReport} contract. When core gains `profile --json`, swap the
   * body of {@link parseProfileText} for a JSON parse — the return type is
   * unchanged. See the TODO below.
   */
  async profile(fixture: string): Promise<ProfileReport> {
    // TODO(core): switch to `['profile', '--fixture', fixture, '--json']`
    // once slipstream-core exposes machine-readable profile output.
    const { stdout } = await this.exec(['profile', '--fixture', fixture]);
    return this.parseProfileText(stdout);
  }

  // -- internals ------------------------------------------------------------

  private async exec(args: string[]) {
    const result = await this.runner.run(args);
    if (result.exitCode !== 0) {
      const subcommand = args[0] ?? '<none>';
      this.logger.warn(
        `slipstream ${subcommand} exited ${result.exitCode}: ${result.stderr.trim()}`,
      );
      throw new CoreInvocationError(
        `slipstream ${subcommand} failed with exit code ${result.exitCode}`,
        result.exitCode,
        result.stderr,
      );
    }
    return result;
  }

  private parseJson<T>(stdout: string, subcommand: string): T {
    try {
      return JSON.parse(stdout) as T;
    } catch {
      throw new CoreInvocationError(
        `slipstream ${subcommand} produced invalid JSON`,
        0,
        stdout.slice(0, 500),
      );
    }
  }

  /**
   * Normalizes a raw engine {@link RawAnalysisReport} (source_name + StaticKey
   * arrays) into the flat {@link AnalysisReport} contract (source + string[]).
   */
  private normalizeReport(raw: RawAnalysisReport): AnalysisReport {
    return {
      source: raw.source_name,
      functions: (raw.functions ?? []).map((f) => ({
        function_name: f.function_name,
        storage_reads: (f.storage_reads ?? []).map((k) => (k.segments ?? []).join('.')),
        storage_writes: (f.storage_writes ?? []).map((k) => (k.segments ?? []).join('.')),
      })),
      detectors: raw.detectors ?? [],
    };
  }

  /**
   * Parses the human-readable `profile` output. Tolerant of whitespace; any
   * field it cannot find defaults to a zero value rather than throwing, so a
   * partial engine output still yields a well-formed report.
   */
  private parseProfileText(text: string): ProfileReport {
    const lines = text.split('\n');
    const num = (label: string): number => {
      const line = lines.find((l) => l.includes(`${label}:`));
      if (!line) return 0;
      const match = line.split(`${label}:`)[1]?.match(/-?\d+(\.\d+)?/);
      return match ? Number(match[0]) : 0;
    };

    const sourceLine = lines.find((l) => l.startsWith('profile:'));
    const source = sourceLine ? sourceLine.replace('profile:', '').trim() : 'unknown';

    const hotKeys: HotKey[] = [];
    const hotKeyStart = lines.findIndex((l) => l.includes('hot keys:'));
    if (hotKeyStart >= 0) {
      for (let i = hotKeyStart + 1; i < lines.length; i++) {
        const m = lines[i].match(/^\s+(\S+)\s+reads=\s*(\d+)\s+writes=\s*(\d+)/);
        if (!m) continue;
        const reads = Number(m[2]);
        const writes = Number(m[3]);
        hotKeys.push({
          key: m[1],
          reads,
          writes,
          touch_count: reads + writes,
        });
      }
    }

    return {
      source,
      transaction_count: num('transactions'),
      distinct_keys: num('distinct keys'),
      stage_count: num('stages'),
      parallelism: num('parallelism'),
      critical_path_length: num('critical path'),
      weighted_critical_path_weight: num('weighted crit.'),
      total_conflicts: num('total conflicts'),
      hot_keys: hotKeys,
      schedule: null,
    };
  }
}
