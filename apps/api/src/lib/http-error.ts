import type { ApiErrorCode } from '@splinance/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ApiErrorCode = 'HTTP_ERROR',
    /** Sent as `error.details`: what the web needs to say it in the UI language. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
