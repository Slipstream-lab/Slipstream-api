/**
 * Abstraction over *how* the `slipstream` binary is invoked. Decoupling the
 * transport (real subprocess vs. in-memory mock) from the parsing/normalizing
 * logic in {@link SlipstreamCoreService} makes the service fully testable
 * without the binary ever needing to exist.
 */
export interface CoreCommandResult {
  /** Raw stdout from the process. */
  stdout: string;
  /** Raw stderr from the process. */
  stderr: string;
  /** Process exit code (0 = success). */
  exitCode: number;
}

export const CORE_RUNNER = Symbol('CORE_RUNNER');

export interface CoreRunner {
  /**
   * Runs the `slipstream` binary with the given arguments and resolves with
   * the captured output. Implementations MUST NOT throw on a non-zero exit
   * code — they return the exit code so the caller can decide.
   */
  run(args: string[]): Promise<CoreCommandResult>;
}
