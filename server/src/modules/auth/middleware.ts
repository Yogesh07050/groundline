import { parse as parseCookies } from 'cookie';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import type { AuthService, User } from './service.js';

export const SESSION_COOKIE = 'groundline_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    sessionToken?: string;
  }
}

export const sessionTokenFrom = (req: Request) => parseCookies(req.headers.cookie ?? '')[SESSION_COOKIE];

/** The signed-in operator; only call after `requireAuth`. */
export function currentUser(req: Request): User {
  if (!req.user) throw new AppError(401, 'unauthenticated', 'Please sign in.');
  return req.user;
}

export function requireAuth(auth: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = sessionTokenFrom(req);
    const user = token ? auth.userForToken(token) : null;
    if (!user) throw new AppError(401, 'unauthenticated', 'Please sign in.');

    // Defence in depth on top of SameSite=Lax: a browser sends Origin on
    // cross-site writes, and it must match the host serving this console.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) {
        throw new AppError(403, 'forbidden_origin', 'This request came from another site.');
      }
    }

    req.user = user;
    req.sessionToken = token;
    next();
  };
}
