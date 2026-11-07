import type { Db } from '../../db/client.js';
import { AppError, fieldError, notFound } from '../../lib/errors.js';
import { likePattern, type Page } from '../../lib/http.js';
import { randomBytes } from 'node:crypto';
import type { KnowledgeEntry, KnowledgeInput, KnowledgeType } from './schemas.js';

interface EntryRow {
  id: string;
  type: KnowledgeType;
  title: string;
  data: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

const toEntry = (row: EntryRow): KnowledgeEntry =>
  ({
    id: row.id,
    type: row.type,
    title: row.title,
    data: JSON.parse(row.data),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as KnowledgeEntry;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export interface ListKnowledgeQuery {
  type?: KnowledgeType;
  enabled?: boolean;
  q?: string;
  sort: 'title' | 'updated';
  page: number;
  pageSize: number;
}

export function createKnowledgeService(db: Db, onChange: () => void) {
  const getRow = (id: string) => db.prepare('SELECT * FROM kb_entries WHERE id = ?').get(id) as EntryRow | undefined;

  const uniqueId = (input: KnowledgeInput) => {
    const prefix = input.type === 'product' ? '' : `${input.type}-`;
    const slug = `${prefix}${slugify(input.title)}` || `${input.type}-entry`;
    return getRow(slug) ? `${slug}-${randomBytes(3).toString('hex')}` : slug;
  };

  const isDuplicateTitle = (err: unknown) =>
    err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_UNIQUE';

  const duplicateError = (input: KnowledgeInput) =>
    fieldError('title', `A ${input.type} titled "${input.title}" already exists.`, 409, 'duplicate_title');

  return {
    list(query: ListKnowledgeQuery): Page<KnowledgeEntry> {
      const where: string[] = [];
      const params: unknown[] = [];
      if (query.type) {
        where.push('type = ?');
        params.push(query.type);
      }
      if (query.enabled !== undefined) {
        where.push('enabled = ?');
        params.push(query.enabled ? 1 : 0);
      }
      if (query.q) {
        where.push(`(title LIKE ? ESCAPE '\\' OR data LIKE ? ESCAPE '\\')`);
        params.push(likePattern(query.q), likePattern(query.q));
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const order = query.sort === 'updated' ? 'updated_at DESC' : 'title COLLATE NOCASE ASC';

      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM kb_entries ${clause}`).get(...params) as {
        total: number;
      };
      const rows = db
        .prepare(`SELECT * FROM kb_entries ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as EntryRow[];
      return { items: rows.map(toEntry), total, page: query.page, pageSize: query.pageSize };
    },

    counts() {
      const rows = db
        .prepare('SELECT type, COUNT(*) AS total, SUM(enabled) AS enabled FROM kb_entries GROUP BY type')
        .all() as Array<{ type: KnowledgeType; total: number; enabled: number }>;
      return rows;
    },

    all(options: { enabledOnly?: boolean } = {}): KnowledgeEntry[] {
      const clause = options.enabledOnly ? 'WHERE enabled = 1' : '';
      const rows = db.prepare(`SELECT * FROM kb_entries ${clause} ORDER BY type, title COLLATE NOCASE`).all() as EntryRow[];
      return rows.map(toEntry);
    },

    get(id: string): KnowledgeEntry {
      const row = getRow(id);
      if (!row) throw notFound('Entry');
      return toEntry(row);
    },

    create(input: KnowledgeInput): KnowledgeEntry {
      const id = uniqueId(input);
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO kb_entries (id, type, title, data, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, input.type, input.title, JSON.stringify(input.data), input.enabled ? 1 : 0, now, now);
      } catch (err) {
        if (isDuplicateTitle(err)) throw duplicateError(input);
        throw err;
      }
      onChange();
      return toEntry(getRow(id)!);
    },

    update(id: string, input: KnowledgeInput): KnowledgeEntry {
      const existing = getRow(id);
      if (!existing) throw notFound('Entry');
      if (existing.type !== input.type) {
        throw new AppError(400, 'type_change_not_allowed', "An entry's type can't be changed. Create a new entry instead.");
      }
      try {
        db.prepare('UPDATE kb_entries SET title = ?, data = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
          input.title,
          JSON.stringify(input.data),
          input.enabled ? 1 : 0,
          new Date().toISOString(),
          id,
        );
      } catch (err) {
        if (isDuplicateTitle(err)) throw duplicateError(input);
        throw err;
      }
      onChange();
      return toEntry(getRow(id)!);
    },

    setEnabled(id: string, enabled: boolean): KnowledgeEntry {
      const { changes } = db
        .prepare('UPDATE kb_entries SET enabled = ?, updated_at = ? WHERE id = ?')
        .run(enabled ? 1 : 0, new Date().toISOString(), id);
      if (!changes) throw notFound('Entry');
      onChange();
      return toEntry(getRow(id)!);
    },

    remove(id: string) {
      const { changes } = db.prepare('DELETE FROM kb_entries WHERE id = ?').run(id);
      if (!changes) throw notFound('Entry');
      onChange();
    },

    findByTitle(type: KnowledgeType, title: string): KnowledgeEntry | null {
      const row = db
        .prepare('SELECT * FROM kb_entries WHERE type = ? AND lower(title) = lower(?)')
        .get(type, title) as EntryRow | undefined;
      return row ? toEntry(row) : null;
    },

    /** Run several writes atomically; the retrieval index refreshes once, afterward. */
    batch<T>(fn: (writer: { create: typeof insertRaw; update: typeof updateRaw }) => T): T {
      const result = db.transaction(() => fn({ create: insertRaw, update: updateRaw }))();
      onChange();
      return result;
    },
  };

  function insertRaw(input: KnowledgeInput) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO kb_entries (id, type, title, data, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(uniqueId(input), input.type, input.title, JSON.stringify(input.data), input.enabled ? 1 : 0, now, now);
  }

  function updateRaw(id: string, input: KnowledgeInput) {
    db.prepare('UPDATE kb_entries SET title = ?, data = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
      input.title,
      JSON.stringify(input.data),
      input.enabled ? 1 : 0,
      new Date().toISOString(),
      id,
    );
  }
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
