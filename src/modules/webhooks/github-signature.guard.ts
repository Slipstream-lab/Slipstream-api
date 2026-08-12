import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

/**
 * Verifies the `X-Hub-Signature-256` HMAC header GitHub sends with every
 * webhook delivery, using `GITHUB_WEBHOOK_SECRET` from config.
 *
 * Requires the raw request body to be available as `req.rawBody` (see
 * main.ts, which enables Express raw-body capture). If the secret is not
 * configured the guard fails closed (rejects), except we surface a clear
 * message so misconfiguration is obvious.
 */
@Injectable()
export class GithubSignatureGuard implements CanActivate {
  private readonly logger = new Logger(GithubSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();

    const secret = this.config.get<string>('github.webhookSecret', '');
    if (!secret) {
      this.logger.error('GITHUB_WEBHOOK_SECRET is not configured.');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const signature = request.header('x-hub-signature-256');
    if (!signature) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');

    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');

    if (!GithubSignatureGuard.safeEqual(signature, expected)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }

  /** Constant-time comparison that tolerates length mismatches. */
  static safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
