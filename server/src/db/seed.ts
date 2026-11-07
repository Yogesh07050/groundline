// Idempotent first-run setup: default settings, the demo knowledge base, and the
// first operator account.
import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../config/env.js';
import { hashPassword, newId } from '../lib/crypto.js';
import type { Logger } from '../lib/logger.js';
import type { Db } from './client.js';
import { seedEntries, seedSettings } from './seedData.js';

export function seedDatabase(db: Db, config: AppConfig, log: Logger) {
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO settings (id, data, updated_at) VALUES (1, ?, ?)').run(
      JSON.stringify(seedSettings(config.groq)),
      now,
    );

    const { count } = db.prepare('SELECT COUNT(*) AS count FROM kb_entries').get() as { count: number };
    if (count === 0) {
      const insert = db.prepare(
        `INSERT INTO kb_entries (id, type, title, data, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      );
      for (const e of seedEntries) insert.run(e.id, e.type, e.title, JSON.stringify(e.data), now, now);
    }
  })();

  const { users } = db.prepare('SELECT COUNT(*) AS users FROM users').get() as { users: number };
  if (users === 0) {
    const password = config.auth.adminPassword ?? randomBytes(12).toString('base64url');
    db.prepare(
      'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(newId('usr'), config.auth.adminEmail, 'Administrator', hashPassword(password), now);

    if (config.auth.adminPassword) {
      log.info({ email: config.auth.adminEmail }, 'Created operator account from environment');
    } else {
      // Deliberately printed once, outside structured logs: nothing else ever stores it.
      console.log(
        `\n  Created operator account\n    email:    ${config.auth.adminEmail}\n    password: ${password}\n` +
          '  Set ADMIN_PASSWORD before first run to choose your own.\n',
      );
    }
  }
}
