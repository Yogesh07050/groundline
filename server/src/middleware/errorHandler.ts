import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

function normalize(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  if (err instanceof MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new AppError(413, 'file_too_large', 'That file is too large. The limit is 2 MB.')
      : new AppError(400, 'invalid_upload', 'That upload could not be processed.');
  }
  // body-parser marks its failures with a `type` string.
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') return new AppError(400, 'invalid_json', 'The request body is not valid JSON.');
  if (type === 'entity.too.large') return new AppError(413, 'payload_too_large', 'The request body is too large.');
  return null;
}

export const apiNotFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'route_not_found', `No route for ${req.method} ${req.originalUrl.split('?')[0]}.`));
};

export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const known = normalize(err);
    if (!known) log.error({ err, path: req.path, method: req.method }, 'Unhandled error');

    const status = known?.status ?? 500;
    res.status(status).json({
      error: {
        code: known?.code ?? 'internal_error',
        message: known?.message ?? 'Something went wrong on our side. Please try again.',
        ...(known?.details ? { details: known.details } : {}),
        requestId: req.id,
      },
    });
  };
}
