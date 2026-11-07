// Reporting, computed directly from stored conversations. Nothing is sampled or
// pre-aggregated: for a single-tenant SQLite deployment these queries stay fast.
import type { Db } from '../../db/client.js';
import { normalizeQuery } from '../chat/outcome.js';
import type { Channel } from '../conversations/repository.js';

export interface AnalyticsRange {
  days: number;
  channel?: Channel;
}

export interface KnowledgeGap {
  query: string;
  normalized: string;
  count: number;
  lastAskedAt: string;
  outcome: 'referred' | 'no_match';
  conversationId: string;
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

function rangeStart(days: number): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? null;
}

export function createAnalyticsService(db: Db) {
  const scope = (range: AnalyticsRange) => ({
    since: rangeStart(range.days).toISOString(),
    channel: range.channel ?? null,
  });
  const CHANNEL = `(@channel IS NULL OR c.channel = @channel)`;

  function gaps(range: AnalyticsRange, limit = 50): KnowledgeGap[] {
    const rows = db
      .prepare(
        `SELECT m.user_query AS query, m.outcome, m.created_at, m.conversation_id
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE m.role = 'assistant' AND m.outcome IN ('referred', 'no_match')
           AND m.user_query IS NOT NULL AND m.created_at >= @since AND ${CHANNEL}
         ORDER BY m.created_at DESC`,
      )
      .all(scope(range)) as Array<{
      query: string;
      outcome: KnowledgeGap['outcome'];
      created_at: string;
      conversation_id: string;
    }>;

    const dismissed = new Set(
      (db.prepare('SELECT normalized_query AS q FROM dismissed_gaps').all() as Array<{ q: string }>).map((r) => r.q),
    );
    const grouped = new Map<string, KnowledgeGap>();
    for (const row of rows) {
      const normalized = normalizeQuery(row.query);
      if (!normalized || dismissed.has(normalized)) continue;
      const existing = grouped.get(normalized);
      if (existing) {
        existing.count += 1;
      } else {
        // Rows are newest-first, so the first seen is the latest asked.
        grouped.set(normalized, {
          query: row.query,
          normalized,
          count: 1,
          lastAskedAt: row.created_at,
          outcome: row.outcome,
          conversationId: row.conversation_id,
        });
      }
    }
    return [...grouped.values()]
      .sort((a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt))
      .slice(0, limit);
  }

  return {
    gaps,

    dismissGap(query: string) {
      db.prepare('INSERT OR REPLACE INTO dismissed_gaps (normalized_query, dismissed_at) VALUES (?, ?)').run(
        normalizeQuery(query),
        new Date().toISOString(),
      );
    },

    overview(range: AnalyticsRange) {
      const params = scope(range);

      const conversations = db
        .prepare(`SELECT COUNT(*) AS n FROM conversations c WHERE c.created_at >= @since AND c.message_count > 0 AND ${CHANNEL}`)
        .get(params) as { n: number };

      const messageTotals = db
        .prepare(
          `SELECT
             SUM(m.role = 'user') AS customerMessages,
             SUM(m.role = 'assistant') AS replies,
             SUM(m.outcome = 'answered') AS answered,
             SUM(m.outcome = 'referred') AS referred,
             SUM(m.outcome = 'no_match') AS noMatch,
             SUM(m.outcome = 'smalltalk') AS smalltalk,
             SUM(m.feedback = 1) AS helpful,
             SUM(m.feedback = -1) AS notHelpful,
             SUM(COALESCE(m.prompt_tokens, 0)) AS promptTokens,
             SUM(COALESCE(m.completion_tokens, 0)) AS completionTokens
           FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE m.created_at >= @since AND ${CHANNEL}`,
        )
        .get(params) as Record<string, number | null>;

      const latencies = (
        db
          .prepare(
            `SELECT m.latency_ms AS v FROM messages m JOIN conversations c ON c.id = m.conversation_id
             WHERE m.latency_ms IS NOT NULL AND m.created_at >= @since AND ${CHANNEL} ORDER BY v`,
          )
          .all(params) as Array<{ v: number }>
      ).map((r) => r.v);

      const n = (key: string) => messageTotals[key] ?? 0;
      const substantive = n('answered') + n('referred') + n('noMatch');

      // Zero-filled so the chart shows quiet days instead of skipping them.
      const daily = new Map<string, { date: string; conversations: number; messages: number }>();
      for (let i = 0; i < range.days; i += 1) {
        const date = rangeStart(range.days);
        date.setUTCDate(date.getUTCDate() + i);
        daily.set(dayKey(date), { date: dayKey(date), conversations: 0, messages: 0 });
      }
      const dailyConversations = db
        .prepare(
          `SELECT substr(c.created_at, 1, 10) AS day, COUNT(*) AS n FROM conversations c
           WHERE c.created_at >= @since AND c.message_count > 0 AND ${CHANNEL} GROUP BY day`,
        )
        .all(params) as Array<{ day: string; n: number }>;
      for (const row of dailyConversations) {
        const bucket = daily.get(row.day);
        if (bucket) bucket.conversations = row.n;
      }
      const dailyMessages = db
        .prepare(
          `SELECT substr(m.created_at, 1, 10) AS day, COUNT(*) AS n
           FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE m.role = 'user' AND m.created_at >= @since AND ${CHANNEL} GROUP BY day`,
        )
        .all(params) as Array<{ day: string; n: number }>;
      for (const row of dailyMessages) {
        const bucket = daily.get(row.day);
        if (bucket) bucket.messages = row.n;
      }

      const topSources = db
        .prepare(
          `SELECT json_extract(source.value, '$.id') AS entryId,
                  json_extract(source.value, '$.title') AS title,
                  json_extract(source.value, '$.type') AS type,
                  COUNT(*) AS uses
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           JOIN json_each(m.sources) AS source
           WHERE m.role = 'assistant' AND m.sources IS NOT NULL AND m.created_at >= @since AND ${CHANNEL}
           GROUP BY entryId ORDER BY uses DESC, title LIMIT 8`,
        )
        .all(params) as Array<{ entryId: string; title: string; type: string; uses: number }>;

      return {
        range: { days: range.days, since: params.since, channel: range.channel ?? null },
        totals: {
          conversations: conversations.n,
          customerMessages: n('customerMessages'),
          replies: n('replies'),
          answered: n('answered'),
          referred: n('referred'),
          noMatch: n('noMatch'),
          smalltalk: n('smalltalk'),
          answerRate: substantive ? n('answered') / substantive : null,
          helpful: n('helpful'),
          notHelpful: n('notHelpful'),
          medianLatencyMs: percentile(latencies, 0.5),
          p95LatencyMs: percentile(latencies, 0.95),
          promptTokens: n('promptTokens'),
          completionTokens: n('completionTokens'),
        },
        daily: [...daily.values()],
        topSources: topSources.map(({ entryId, ...source }) => ({ id: entryId, ...source })),
        gaps: gaps(range, 5),
      };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
