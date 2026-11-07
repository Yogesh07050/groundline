import type { RequestHandler } from 'express';

/** CORS for public widget routes only. The operator API stays same-origin. */
export function publicCors(allowedOrigins: string[]): RequestHandler {
  const allowAll = allowedOrigins.includes('*');
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowAll || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
      if (!allowAll) res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Visitor-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}
