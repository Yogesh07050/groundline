import { type CookieOptions, type RequestHandler, Router } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { handler, parse } from '../../lib/http.js';
import { currentUser, requireAuth, SESSION_COOKIE, sessionTokenFrom } from './middleware.js';
import type { AuthService } from './service.js';

const loginBody = z.object({
  email: z.email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(200),
});

export function authRoutes(auth: AuthService, config: AppConfig, loginLimiter: RequestHandler) {
  const router = Router();
  const cookie: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.auth.cookieSecure,
    path: '/',
    maxAge: config.auth.sessionTtlMs,
  };

  router.post(
    '/login',
    loginLimiter,
    handler((req, res) => {
      const { email, password } = parse(loginBody, req.body);
      const { user, token } = auth.login(email, password);
      res.cookie(SESSION_COOKIE, token, cookie).json({ user });
    }),
  );

  router.post(
    '/logout',
    handler((req, res) => {
      const token = sessionTokenFrom(req);
      if (token) auth.logout(token);
      res.clearCookie(SESSION_COOKIE, { ...cookie, maxAge: undefined }).status(204).end();
    }),
  );

  router.get(
    '/me',
    requireAuth(auth),
    handler((req, res) => {
      res.json({ user: currentUser(req) });
    }),
  );

  router.post(
    '/password',
    requireAuth(auth),
    loginLimiter,
    handler((req, res) => {
      const { currentPassword, newPassword } = parse(passwordBody, req.body);
      const token = auth.changePassword(currentUser(req).id, currentPassword, newPassword);
      res.cookie(SESSION_COOKIE, token, cookie).status(204).end();
    }),
  );

  return router;
}
