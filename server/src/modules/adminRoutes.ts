// Smaller operator endpoints: analytics, handoffs, settings, provider status, and
// the playground. Larger areas (knowledge, conversations) have their own routers.
import { Router } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { handler, pageQuery, parse } from '../lib/http.js';
import type { Logger } from '../lib/logger.js';
import type { AnalyticsService } from './analytics/service.js';
import { type LlmClient, toProviderError } from './chat/llm.js';
import type { ChatService } from './chat/service.js';
import { streamResponse } from './chat/sse.js';
import type { ConversationRepository } from './conversations/repository.js';
import type { HandoffService } from './handoffs/service.js';
import { settingsSchema, type SettingsService } from './settings/service.js';

const rangeQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  channel: z.enum(['widget', 'playground', 'scenario']).optional(),
});

export function adminRoutes(deps: {
  analytics: AnalyticsService;
  handoffs: HandoffService;
  settings: SettingsService;
  chat: ChatService;
  conversations: ConversationRepository;
  llm: LlmClient;
  config: AppConfig;
  log: Logger;
}) {
  const { analytics, handoffs, settings, chat, conversations, llm, config, log } = deps;
  const router = Router();

  // --- Analytics ---------------------------------------------------------------

  router.get(
    '/analytics/overview',
    handler((req, res) => {
      res.json({ ...analytics.overview(parse(rangeQuery, req.query)), openHandoffs: handoffs.openCount() });
    }),
  );

  router.get(
    '/analytics/gaps',
    handler((req, res) => {
      res.json({ items: analytics.gaps(parse(rangeQuery, req.query)) });
    }),
  );

  router.post(
    '/analytics/gaps/dismiss',
    handler((req, res) => {
      const { query } = parse(z.object({ query: z.string().trim().min(1).max(2000) }), req.body);
      analytics.dismissGap(query);
      res.status(204).end();
    }),
  );

  // --- Handoffs ----------------------------------------------------------------

  router.get(
    '/handoffs',
    handler((req, res) => {
      const { status, page, pageSize } = parse(
        pageQuery.extend({ status: z.enum(['open', 'closed']).optional() }),
        req.query,
      );
      res.json({ ...handoffs.list(status, page, pageSize), openCount: handoffs.openCount() });
    }),
  );

  router.patch(
    '/handoffs/:id',
    handler((req, res) => {
      const { status } = parse(z.object({ status: z.enum(['open', 'closed']) }), req.body);
      res.json(handoffs.setStatus(req.params.id!, status));
    }),
  );

  // --- Settings & provider -----------------------------------------------------

  router.get(
    '/settings',
    handler((_req, res) => {
      res.json({ settings: settings.get(), defaultModel: config.groq.model });
    }),
  );

  router.put(
    '/settings',
    handler((req, res) => {
      res.json({ settings: settings.save(parse(settingsSchema, req.body)), defaultModel: config.groq.model });
    }),
  );

  /** Makes a real request to the provider, so this reports actual connectivity. */
  router.get(
    '/provider',
    handler(async (_req, res) => {
      const model = settings.effectiveModel();
      if (!llm.configured) {
        res.json({ configured: false, reachable: false, model, modelAvailable: false, models: [], error: null });
        return;
      }
      try {
        const models = await llm.listModels();
        res.json({ configured: true, reachable: true, model, modelAvailable: models.includes(model), models, error: null });
      } catch (err) {
        log.warn({ err }, 'Provider status check failed');
        res.json({
          configured: true,
          reachable: false,
          model,
          modelAvailable: false,
          models: [],
          error: toProviderError(err).message,
        });
      }
    }),
  );

  // --- Playground: the real pipeline, plus the retrieval details customers don't see ---

  router.post(
    '/playground/conversations',
    handler((_req, res) => {
      res.status(201).json({ id: chat.start('playground') });
    }),
  );

  router.post(
    '/playground/conversations/:id/messages',
    handler(async (req, res) => {
      const { content } = parse(
        z.object({ content: z.string().trim().min(1, 'Message cannot be empty.').max(config.chat.maxMessageLength) }),
        req.body,
      );
      const id = req.params.id!;
      await streamResponse(
        req,
        res,
        log,
        async (send, signal) => {
          const reply = await chat.send(
            id,
            content,
            {
              onUserMessage: (message) => send('start', { userMessageId: message.id }),
              onDelta: (text) => send('delta', { text }),
            },
            signal,
          );
          send('done', { message: reply });
        },
        (error) => error.message,
      );
    }),
  );

  router.post(
    '/playground/conversations/:id/retry',
    handler(async (req, res) => {
      await streamResponse(
        req,
        res,
        log,
        async (send, signal) => {
          const reply = await chat.retry(req.params.id!, { onDelta: (text) => send('delta', { text }) }, signal);
          send('done', { message: reply });
        },
        (error) => error.message,
      );
    }),
  );

  // Referenced so a playground transcript can be reloaded after a refresh.
  router.get(
    '/playground/conversations/:id',
    handler((req, res) => {
      res.json({ messages: conversations.messages(req.params.id!) });
    }),
  );

  return router;
}
