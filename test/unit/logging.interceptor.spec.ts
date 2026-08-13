import { ExecutionContext, Logger } from '@nestjs/common';
import { of } from 'rxjs';
import {
  LoggingInterceptor,
  REQUEST_ID_HEADER,
} from '../../src/common/interceptors/logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let loggerSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerSpy.mockRestore();
  });

  function mockContext(
    req: Record<string, unknown>,
    response: { statusCode: number; setHeader: jest.Mock },
  ): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  it('generates a request id and sets it on the response', (done) => {
    const setHeader = jest.fn();
    const context = mockContext(
      { get: jest.fn().mockReturnValue(undefined), method: 'GET', url: '/health' },
      { statusCode: 200, setHeader },
    );

    interceptor.intercept(context, { handle: () => of('ok') }).subscribe(() => {
      expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, expect.any(String));
      done();
    });
  });

  it('honors and echoes an inbound x-request-id', (done) => {
    const setHeader = jest.fn();
    const context = mockContext(
      { get: jest.fn().mockReturnValue('inbound-id-123'), method: 'POST', url: '/api/contracts' },
      { statusCode: 201, setHeader },
    );

    interceptor.intercept(context, { handle: () => of('ok') }).subscribe(() => {
      expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'inbound-id-123');
      done();
    });
  });

  it('logs the request id, method, url and status', (done) => {
    const context = mockContext(
      { get: jest.fn().mockReturnValue('req-1'), method: 'GET', url: '/api/contracts' },
      { statusCode: 200, setHeader: jest.fn() },
    );

    interceptor.intercept(context, { handle: () => of('ok') }).subscribe(() => {
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(/req-1 GET \/api\/contracts 200 \+\d+ms/),
      );
      done();
    });
  });

  it('passes non-http contexts through untouched', (done) => {
    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;
    const handle = { handle: () => of('value') };
    interceptor.intercept(context, handle).subscribe((value) => {
      expect(value).toBe('value');
      done();
    });
  });
});
