import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { CoreCommandResult, CoreRunner } from './core-runner.interface';

/**
 * A {@link CoreRunner} that shells out to the real `slipstream` CLI binary.
 *
 * The binary path comes from config (`SLIPSTREAM_BIN`, default `slipstream`).
 * We never assume the binary exists: a spawn error (ENOENT) resolves to a
 * non-zero exit code with the error on stderr, exactly like a failed run, so
 * callers handle both uniformly.
 */
@Injectable()
export class SubprocessCoreRunner implements CoreRunner {
  private readonly logger = new Logger(SubprocessCoreRunner.name);

  constructor(private readonly config: ConfigService) {}

  run(args: string[]): Promise<CoreCommandResult> {
    const bin = this.config.get<string>('core.bin', 'slipstream');
    const timeoutMs = this.config.get<number>('core.timeoutMs', 60000);

    this.logger.debug(`Invoking: ${bin} ${args.join(' ')}`);

    return new Promise<CoreCommandResult>((resolve) => {
      const child = spawn(bin, args, {
        // Never run through a shell — avoids injection via crafted paths.
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        resolve({
          stdout,
          stderr: `${stderr}\nslipstream timed out after ${timeoutMs}ms`,
          exitCode: 124,
        });
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // e.g. ENOENT when the binary is not installed.
        resolve({
          stdout,
          stderr: `${stderr}${err.message}`,
          exitCode: 127,
        });
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  }
}
