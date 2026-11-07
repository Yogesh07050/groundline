import type { AppConfig } from '../../config/env.js';
import type { Db } from '../../db/client.js';
import { AppError, fieldError } from '../../lib/errors.js';
import { DUMMY_PASSWORD_HASH, hashPassword, newToken, sha256, verifyPassword } from '../../lib/crypto.js';

export interface User {
  id: string;
  email: string;
  name: string;
}

interface UserRow extends User {
  password_hash: string;
}

export function createAuthService(db: Db, config: AppConfig) {
  const issueSession = (userId: string) => {
    const token = newToken();
    const now = Date.now();
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      sha256(token),
      userId,
      new Date(now + config.auth.sessionTtlMs).toISOString(),
      new Date(now).toISOString(),
    );
    return token;
  };

  return {
    login(email: string, password: string): { user: User; token: string } {
      const row = db
        .prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
        .get(email) as UserRow | undefined;
      const valid = verifyPassword(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
      if (!row || !valid) throw new AppError(401, 'invalid_credentials', 'Incorrect email or password.');

      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
      return { user: { id: row.id, email: row.email, name: row.name }, token: issueSession(row.id) };
    },

    logout(token: string) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    },

    userForToken(token: string): User | null {
      const row = db
        .prepare(
          `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > ?`,
        )
        .get(sha256(token), new Date().toISOString()) as User | undefined;
      return row ?? null;
    },

    /** Changes the password and signs out every other session. Returns a fresh token. */
    changePassword(userId: string, current: string, next: string): string {
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
        | Pick<UserRow, 'password_hash'>
        | undefined;
      if (!row || !verifyPassword(current, row.password_hash)) {
        throw fieldError('currentPassword', 'Your current password is incorrect.');
      }
      return db.transaction(() => {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), userId);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
        return issueSession(userId);
      })();
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
