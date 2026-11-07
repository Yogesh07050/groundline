// Persistence for conversations and messages, shared by the chat pipeline and
// the operator console.
import type { Db } from '../../db/client.js';
import { likePattern, type Page } from '../../lib/http.js';
import { newId } from '../../lib/crypto.js';
import type { Outcome } from '../chat/outcome.js';

export type Channel = 'widget' | 'playground' | 'scenario';
export type ConversationStatus = 'open' | 'escalated' | 'resolved';

export interface SourceRef {
  id: string;
  type: string;
  title: string;
  score: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  outcome: Outcome | null;
  sources: SourceRef[];
  model: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  feedback: -1 | 1 | null;
}

export interface Conversation {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  title: string | null;
  messageCount: number;
  createdAt: string;
  lastMessageAt: string;
  lastOutcome: Outcome | null;
  negativeFeedback: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  outcome: Outcome | null;
  sources: string | null;
  model: string | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  feedback: -1 | 1 | null;
}

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
  outcome: r.outcome,
  sources: r.sources ? (JSON.parse(r.sources) as SourceRef[]) : [],
  model: r.model,
  latencyMs: r.latency_ms,
  promptTokens: r.prompt_tokens,
  completionTokens: r.completion_tokens,
  feedback: r.feedback,
});

interface ConversationRow {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  title: string | null;
  message_count: number;
  created_at: string;
  last_message_at: string;
  last_outcome: Outcome | null;
  negative_feedback: number;
}

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  channel: r.channel,
  status: r.status,
  title: r.title,
  messageCount: r.message_count,
  createdAt: r.created_at,
  lastMessageAt: r.last_message_at,
  lastOutcome: r.last_outcome,
  negativeFeedback: r.negative_feedback,
});

const CONVERSATION_COLUMNS = `
  c.id, c.channel, c.status, c.title, c.message_count, c.created_at, c.last_message_at,
  (SELECT outcome FROM messages m WHERE m.conversation_id = c.id AND m.role = 'assistant'
    ORDER BY m.rowid DESC LIMIT 1) AS last_outcome,
  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.feedback = -1) AS negative_feedback`;

export interface ConversationFilters {
  q?: string;
  status?: ConversationStatus;
  channel?: Channel;
  outcome?: Outcome;
  days?: number;
}

export type ConversationSort = 'recent' | 'oldest' | 'longest';

const SORT_SQL: Record<ConversationSort, string> = {
  recent: 'c.last_message_at DESC',
  oldest: 'c.last_message_at ASC',
  longest: 'c.message_count DESC, c.last_message_at DESC',
};

export interface AssistantReplyInput {
  conversationId: string;
  content: string;
  userQuery: string;
  outcome: Outcome;
  sources: SourceRef[];
  model: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export function createConversationRepository(db: Db) {
  const whereFor = (filters: ConversationFilters) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      where.push('c.status = ?');
      params.push(filters.status);
    }
    if (filters.channel) {
      where.push('c.channel = ?');
      params.push(filters.channel);
    }
    if (filters.days) {
      where.push('c.last_message_at >= ?');
      params.push(new Date(Date.now() - filters.days * 86_400_000).toISOString());
    }
    if (filters.outcome) {
      where.push('EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.outcome = ?)');
      params.push(filters.outcome);
    }
    if (filters.q) {
      where.push(
        `EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ? ESCAPE '\\')`,
      );
      params.push(likePattern(filters.q));
    }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  };

  const repo = {
    create(channel: Channel, visitorTokenHash: string | null): string {
      const id = newId('conv');
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO conversations (id, visitor_token_hash, channel, created_at, last_message_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, visitorTokenHash, channel, now, now);
      return id;
    },

    tokenHash(id: string): string | null | undefined {
      const row = db.prepare('SELECT visitor_token_hash AS hash FROM conversations WHERE id = ?').get(id) as
        | { hash: string | null }
        | undefined;
      return row === undefined ? undefined : row.hash;
    },

    get(id: string): Conversation | null {
      const row = db.prepare(`SELECT ${CONVERSATION_COLUMNS} FROM conversations c WHERE c.id = ?`).get(id) as
        | ConversationRow
        | undefined;
      return row ? toConversation(row) : null;
    },

    list(filters: ConversationFilters, sort: ConversationSort, page: number, pageSize: number): Page<Conversation> {
      const { clause, params } = whereFor(filters);
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM conversations c ${clause}`).get(...params) as {
        total: number;
      };
      const rows = db
        .prepare(
          `SELECT ${CONVERSATION_COLUMNS} FROM conversations c ${clause}
           ORDER BY ${SORT_SQL[sort]} LIMIT ? OFFSET ?`,
        )
        .all(...params, pageSize, (page - 1) * pageSize) as ConversationRow[];
      return { items: rows.map(toConversation), total, page, pageSize };
    },

    /** Every message matching the filters, oldest conversation first, for export. */
    exportRows(filters: ConversationFilters) {
      const { clause, params } = whereFor(filters);
      return db
        .prepare(
          `SELECT c.id AS conversation_id, c.channel, c.status, msg.role, msg.content, msg.created_at,
                  msg.outcome, msg.model, msg.latency_ms, msg.feedback
           FROM conversations c JOIN messages msg ON msg.conversation_id = c.id
           ${clause}
           ORDER BY c.created_at, msg.rowid LIMIT 50000`,
        )
        .all(...params) as Array<{
        conversation_id: string;
        channel: string;
        status: string;
        role: string;
        content: string;
        created_at: string;
        outcome: string | null;
        model: string | null;
        latency_ms: number | null;
        feedback: number | null;
      }>;
    },

    messages(conversationId: string): Message[] {
      const rows = db
        .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY rowid')
        .all(conversationId) as MessageRow[];
      return rows.map(toMessage);
    },

    addUserMessage(conversationId: string, content: string): Message {
      const id = newId('msg');
      const now = new Date().toISOString();
      return db.transaction(() => {
        db.prepare(
          'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(id, conversationId, 'user', content, now);
        // A customer writing back reopens a resolved conversation; an escalation stays escalated.
        db.prepare(
          `UPDATE conversations SET message_count = message_count + 1, last_message_at = ?,
             title = COALESCE(title, ?),
             status = CASE status WHEN 'resolved' THEN 'open' ELSE status END
           WHERE id = ?`,
        ).run(now, content.slice(0, 120), conversationId);
        return repo.message(id)!;
      })();
    },

    addAssistantMessage(input: AssistantReplyInput): Message {
      const id = newId('msg');
      const now = new Date().toISOString();
      return db.transaction(() => {
        db.prepare(
          `INSERT INTO messages (id, conversation_id, role, content, created_at, user_query, outcome, sources,
             model, latency_ms, prompt_tokens, completion_tokens)
           VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          input.conversationId,
          input.content,
          now,
          input.userQuery,
          input.outcome,
          JSON.stringify(input.sources),
          input.model,
          input.latencyMs,
          input.promptTokens,
          input.completionTokens,
        );
        db.prepare(
          'UPDATE conversations SET message_count = message_count + 1, last_message_at = ? WHERE id = ?',
        ).run(now, input.conversationId);
        return repo.message(id)!;
      })();
    },

    message(id: string): Message | null {
      const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
      return row ? toMessage(row) : null;
    },

    setFeedback(messageId: string, value: -1 | 1 | null) {
      db.prepare('UPDATE messages SET feedback = ? WHERE id = ?').run(value, messageId);
    },

    setStatus(id: string, status: ConversationStatus): boolean {
      return db.prepare('UPDATE conversations SET status = ? WHERE id = ?').run(status, id).changes > 0;
    },

    remove(id: string): boolean {
      return db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0;
    },
  };
  return repo;
}

export type ConversationRepository = ReturnType<typeof createConversationRepository>;
