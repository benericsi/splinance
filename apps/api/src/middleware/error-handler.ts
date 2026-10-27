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

/**
 * Errors from express.json (body-parser): a client mistake, not ours. They carry the status
 * to answer with and `expose: true`; `type` says which mistake it was.
 */
interface BodyParserError {
  status: number;
  expose: true;
  type: string;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  if (typeof err !== 'object' || err === null) return false;
  const { status, expose, type } = err as Partial<BodyParserError>;
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    expose === true &&
    typeof type === 'string'
  );
}

const BODY_ERRORS: Record<string, { code: string; message: string }> = {
  'entity.parse.failed': { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
  'entity.too.large': { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
  'encoding.unsupported': {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Compressed request bodies are not supported',
  },
  'charset.unsupported': {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Request body must be UTF-8',
  },
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

  if (isBodyParserError(err)) {
    sendError(
      res,
      err.status,
      BODY_ERRORS[err.type] ?? { code: 'BAD_REQUEST', message: 'Invalid request body' },
    );
    return;
  }

  // Unknown errors: log full detail, never leak internals to the client.
  req.log.error({ err }, 'Unhandled error');
  sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
};
