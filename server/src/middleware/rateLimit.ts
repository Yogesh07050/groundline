// Per-IP limits using an in-memory store, which fits a single-instance deployment.
// Running several instances would need a shared store such as Redis.
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/errors.js';

export function createLimiter(options: { windowMs: number; max: number; message: string }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'rate_limited', options.message)),
  });
}
