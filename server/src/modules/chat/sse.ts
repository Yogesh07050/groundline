// Server-Sent Events over a POST response. Failures after the stream opens can't
// change the HTTP status, so they're delivered as a typed `error` event.
import type { Request, Response } from 'express';
import type { Logger } from '../../lib/logger.js';
import { type AppError } from '../../lib/errors.js';
import { toProviderError } from './llm.js';

export type SseSend = (event: string, data: unknown) => void;

const RETRYABLE = new Set(['llm_unavailable', 'llm_rate_limited', 'llm_empty_reply']);

export async function streamResponse(
  req: Request,
  res: Response,
  log: Logger,
  run: (send: SseSend, signal: AbortSignal) => Promise<void>,
  describeError: (error: AppError) => string,
) {
  const abort = new AbortController();
  // Stop paying for tokens as soon as the visitor goes away.
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  let opened = false;
  const send: SseSend = (event, data) => {
    if (!opened) {
      opened = true;
      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
    }
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await run(send, abort.signal);
    res.end();
  } catch (err) {
    if (abort.signal.aborted) {
      log.info({ path: req.path }, 'Client disconnected during reply');
      res.end();
      return;
    }
    const error = toProviderError(err);
    log.error({ err, code: error.code, path: req.path }, 'Reply failed');
    // Pre-stream failures (404, 409, 503...) can still use a real status code.
    if (!opened) throw error;
    send('error', { code: error.code, message: describeError(error), retryable: RETRYABLE.has(error.code) });
    res.end();
  }
}
