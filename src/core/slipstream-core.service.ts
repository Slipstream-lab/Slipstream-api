import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORE_RUNNER, CoreRunner } from './core-runner.interface';
import { AnalysisReport, DiffReport, ProfileReport, RawAnalysisReport } from './core.types';

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
   * `slipstream profile --fixture <fixture> --json` → typed {@link ProfileReport}.
   *
   * The engine serializes `ProfileReport` directly (metrics + the full
   * `schedule`), so this is a straight JSON parse — no text scraping.
   */
  async profile(fixture: string): Promise<ProfileReport> {
    const { stdout } = await this.exec(['profile', '--fixture', fixture, '--json']);
    return this.parseJson<ProfileReport>(stdout, 'profile');
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
}
