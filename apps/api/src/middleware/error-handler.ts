import type { ApiErrorResponse } from '@splinance/shared';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError, z } from 'zod';
import { HttpError } from '../lib/http-error';

function sendError(res: Response, status: number, error: ApiErrorResponse['error']) {
  const body: ApiErrorResponse = { error };
  res.status(status).json(body);
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route ${req.method} ${req.path} not found`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof ZodError) {
    sendError(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: z.treeifyError(err),
    });
    return;
  }

  if (err instanceof HttpError) {
    sendError(res, err.status, { code: err.code, message: err.message });
    return;
  }

  // Unknown errors: log full detail, never leak internals to the client.
  req.log.error({ err }, 'Unhandled error');
  sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
};
