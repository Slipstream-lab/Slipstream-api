import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** Response header carrying the correlation id. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * A request decorated with its correlation id. Other services can read it from
 * `request.id` to correlate log lines across the request lifecycle.
 */
export type RequestWithId = Request & { id: string };

/**
 * Logs one line per HTTP request (method, path, status, latency, request id)
 * and propagates a correlation id: an inbound `x-request-id` is honored and
 * echoed, otherwise a `randomUUID()` is generated and set on the response.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();

    const requestId =
      (request.get?.(REQUEST_ID_HEADER) as string | undefined)?.trim() || randomUUID();
    request.id = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${requestId} ${method} ${url} ${response.statusCode} +${Date.now() - start}ms`,
          );
        },
        error: (err: unknown) => {
          const status =
            err && typeof err === 'object' && 'status' in err
              ? (err as { status: number }).status
              : 500;
          this.logger.warn(`${requestId} ${method} ${url} ${status} +${Date.now() - start}ms`);
        },
      }),
    );
  }
}
