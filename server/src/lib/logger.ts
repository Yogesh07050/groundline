import { pino } from 'pino';
import { config } from '../config/env.js';

export const logger = pino({
  level: config.logLevel,
  // Defensive: these should never be logged, but a stray object must not leak them.
  redact: ['password', 'passwordHash', 'req.headers.cookie', 'req.headers["x-visitor-token"]', 'apiKey'],
  ...(config.env === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } } }
    : {}),
});

export type Logger = typeof logger;
