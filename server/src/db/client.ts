import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from './migrations.js';

export type Db = Database.Database;

export function openDatabase(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: Db) {
  const current = db.pragma('user_version', { simple: true }) as number;
  migrations.slice(current).forEach((sql, offset) => {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${current + offset + 1}`);
    })();
  });
}
