import type { ApiErrorCode } from '@splinance/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ApiErrorCode = 'HTTP_ERROR',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
