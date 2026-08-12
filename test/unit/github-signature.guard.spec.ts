import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GithubSignatureGuard } from '../../src/modules/webhooks/github-signature.guard';

const SECRET = 'test-webhook-secret';

function contextWith(rawBody: Buffer, signature?: string): ExecutionContext {
  const req = {
    rawBody,
    body: JSON.parse(rawBody.toString() || '{}'),
    header: (name: string) =>
      name.toLowerCase() === 'x-hub-signature-256' ? signature : undefined,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function sign(body: Buffer, secret = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('GithubSignatureGuard', () => {
  const config = {
    get: (_key: string, def?: string) => SECRET ?? def,
  } as unknown as ConfigService;
  const guard = new GithubSignatureGuard(config);

  it('accepts a request with a valid signature', () => {
    const body = Buffer.from(JSON.stringify({ action: 'opened' }));
    const ctx = contextWith(body, sign(body));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a request with an invalid signature', () => {
    const body = Buffer.from(JSON.stringify({ action: 'opened' }));
    const ctx = contextWith(body, sign(body, 'wrong-secret'));
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a request with no signature header', () => {
    const body = Buffer.from(JSON.stringify({ action: 'opened' }));
    const ctx = contextWith(body, undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects when the secret is not configured', () => {
    const noSecret = {
      get: (_key: string, def?: string) => def ?? '',
    } as unknown as ConfigService;
    const g = new GithubSignatureGuard(noSecret);
    const body = Buffer.from('{}');
    const ctx = contextWith(body, sign(body));
    expect(() => g.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  describe('safeEqual', () => {
    it('is false for different-length strings', () => {
      expect(GithubSignatureGuard.safeEqual('abc', 'abcd')).toBe(false);
    });
    it('is true for identical strings', () => {
      expect(GithubSignatureGuard.safeEqual('abc', 'abc')).toBe(true);
    });
  });
});
