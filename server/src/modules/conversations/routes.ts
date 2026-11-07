import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { handler, pageQuery, parse, toCsv } from '../../lib/http.js';
import type { HandoffService } from '../handoffs/service.js';
import type { ConversationRepository } from './repository.js';

const filters = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['open', 'escalated', 'resolved']).optional(),
  channel: z.enum(['widget', 'playground', 'scenario']).optional(),
  outcome: z.enum(['answered', 'referred', 'no_match', 'smalltalk']).optional(),
  days: z.coerce.number().int().min(1).max(3650).optional(),
});

const listQuery = pageQuery.extend(filters.shape).extend({
  sort: z.enum(['recent', 'oldest', 'longest']).default('recent'),
});

export function conversationRoutes(conversations: ConversationRepository, handoffs: HandoffService) {
  const router = Router();

  router.get(
    '/',
    handler((req, res) => {
      const { page, pageSize, sort, q, ...rest } = parse(listQuery, req.query);
      res.json(conversations.list({ ...rest, q: q || undefined }, sort, page, pageSize));
    }),
  );

  router.get(
    '/export.csv',
    handler((req, res) => {
      const { q, ...rest } = parse(filters, req.query);
      const rows = conversations.exportRows({ ...rest, q: q || undefined });
      const csv = toCsv(
        ['conversation_id', 'channel', 'status', 'role', 'content', 'created_at', 'outcome', 'model', 'latency_ms', 'feedback'],
        rows.map((r) => [
          r.conversation_id, r.channel, r.status, r.role, r.content, r.created_at, r.outcome, r.model, r.latency_ms, r.feedback,
        ]),
      );
      res.setHeader('Content-Disposition', 'attachment; filename="conversations.csv"').type('text/csv').send(csv);
    }),
  );

  router.get(
    '/:id',
    handler((req, res) => {
      const conversation = conversations.get(req.params.id!);
      if (!conversation) throw notFound('Conversation');
      res.json({
        conversation,
        messages: conversations.messages(conversation.id),
        handoffs: handoffs.forConversation(conversation.id),
      });
    }),
  );

  router.patch(
    '/:id',
    handler((req, res) => {
      const { status } = parse(z.object({ status: z.enum(['open', 'escalated', 'resolved']) }), req.body);
      if (!conversations.setStatus(req.params.id!, status)) throw notFound('Conversation');
      res.json(conversations.get(req.params.id!));
    }),
  );

  router.delete(
    '/:id',
    handler((req, res) => {
      if (!conversations.remove(req.params.id!)) throw notFound('Conversation');
      res.status(204).end();
    }),
  );

  return router;
}
