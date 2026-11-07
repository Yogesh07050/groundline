// Customer requests to reach a person. These are recorded for the team to work
// from the console; no email is sent, as the project has no mail provider.
import type { Db } from '../../db/client.js';
import { notFound } from '../../lib/errors.js';
import { newId } from '../../lib/crypto.js';
import type { Page } from '../../lib/http.js';

export type HandoffStatus = 'open' | 'closed';

export interface Handoff {
  id: string;
  conversationId: string;
  conversationTitle: string | null;
  name: string;
  email: string;
  note: string | null;
  status: HandoffStatus;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  conversation_id: string;
  title: string | null;
  name: string;
  email: string;
  note: string | null;
  status: HandoffStatus;
  created_at: string;
  updated_at: string;
}

const toHandoff = (r: Row): Handoff => ({
  id: r.id,
  conversationId: r.conversation_id,
  conversationTitle: r.title,
  name: r.name,
  email: r.email,
  note: r.note,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT = `SELECT h.*, c.title FROM handoffs h JOIN conversations c ON c.id = h.conversation_id`;

export function createHandoffService(db: Db) {
  return {
    /** Requesting twice updates the open request instead of creating a duplicate. */
    request(conversationId: string, input: { name: string; email: string; note?: string }): Handoff {
      const now = new Date().toISOString();
      const id = db.transaction(() => {
        const open = db
          .prepare(`SELECT id FROM handoffs WHERE conversation_id = ? AND status = 'open'`)
          .get(conversationId) as { id: string } | undefined;
        const handoffId = open?.id ?? newId('hnd');
        if (open) {
          db.prepare('UPDATE handoffs SET name = ?, email = ?, note = ?, updated_at = ? WHERE id = ?').run(
            input.name, input.email, input.note ?? null, now, handoffId,
          );
        } else {
          db.prepare(
            `INSERT INTO handoffs (id, conversation_id, name, email, note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ).run(handoffId, conversationId, input.name, input.email, input.note ?? null, now, now);
        }
        db.prepare(`UPDATE conversations SET status = 'escalated' WHERE id = ?`).run(conversationId);
        return handoffId;
      })();
      return toHandoff(db.prepare(`${SELECT} WHERE h.id = ?`).get(id) as Row);
    },

    list(status: HandoffStatus | undefined, page: number, pageSize: number): Page<Handoff> {
      const clause = status ? 'WHERE h.status = ?' : '';
      const params = status ? [status] : [];
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM handoffs h ${clause}`).get(...params) as { total: number };
      const rows = db
        .prepare(`${SELECT} ${clause} ORDER BY h.status DESC, h.created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, pageSize, (page - 1) * pageSize) as Row[];
      return { items: rows.map(toHandoff), total, page, pageSize };
    },

    forConversation(conversationId: string): Handoff[] {
      const rows = db.prepare(`${SELECT} WHERE h.conversation_id = ? ORDER BY h.created_at DESC`).all(conversationId) as Row[];
      return rows.map(toHandoff);
    },

    openCount(): number {
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM handoffs WHERE status = 'open'`).get() as { n: number };
      return n;
    },

    /** Closing the last open request also resolves its conversation. */
    setStatus(id: string, status: HandoffStatus): Handoff {
      return db.transaction(() => {
        const existing = db.prepare('SELECT conversation_id FROM handoffs WHERE id = ?').get(id) as
          | { conversation_id: string }
          | undefined;
        if (!existing) throw notFound('Handoff');
        db.prepare('UPDATE handoffs SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
        db.prepare(
          `UPDATE conversations SET status = ? WHERE id = ?`,
        ).run(status === 'closed' ? 'resolved' : 'escalated', existing.conversation_id);
        return toHandoff(db.prepare(`${SELECT} WHERE h.id = ?`).get(id) as Row);
      })();
    },
  };
}

export type HandoffService = ReturnType<typeof createHandoffService>;
