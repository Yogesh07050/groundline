// Endpoints the embeddable widget and demo storefront use. They're anonymous, so
// each conversation is protected by a token only its creator holds, and responses
// never include retrieval internals.
import { type Request, type RequestHandler, Router } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { newToken, safeEqual, sha256 } from '../../lib/crypto.js';
import { AppError, notFound } from '../../lib/errors.js';
import { handler, parse } from '../../lib/http.js';
import type { Logger } from '../../lib/logger.js';
import type { LlmClient } from '../chat/llm.js';
import type { ChatService } from '../chat/service.js';
import { streamResponse } from '../chat/sse.js';
import type { ConversationRepository, Message } from '../conversations/repository.js';
import type { HandoffService } from '../handoffs/service.js';
import type { KnowledgeService } from '../knowledge/service.js';
import type { SettingsService } from '../settings/service.js';

const publicMessage = ({ id, role, content, createdAt, feedback }: Message) => ({ id, role, content, createdAt, feedback });

export function publicRoutes(deps: {
  chat: ChatService;
  conversations: ConversationRepository;
  handoffs: HandoffService;
  knowledge: KnowledgeService;
  settings: SettingsService;
  llm: LlmClient;
  config: AppConfig;
  log: Logger;
  chatLimiter: RequestHandler;
  writeLimiter: RequestHandler;
}) {
  const { chat, conversations, handoffs, knowledge, settings, llm, config, log, chatLimiter, writeLimiter } = deps;
  const router = Router();

  const messageBody = z.object({
    content: z
      .string({ error: 'A message is required.' })
      .trim()
      .min(1, 'Message cannot be empty.')
      .max(config.chat.maxMessageLength, `Message is too long (max ${config.chat.maxMessageLength} characters).`),
  });

  const handoffBody = z.object({
    name: z.string().trim().min(1, 'Enter your name').max(120),
    email: z.email('Enter a valid email address').max(254),
    note: z.string().trim().max(1000).optional(),
  });

  /** 404, not 403: a stranger shouldn't learn whether a conversation exists. */
  const authorizeVisitor = (req: Request): string => {
    const id = req.params.id!;
    const stored = conversations.tokenHash(id);
    const token = req.get('x-visitor-token');
    if (!stored || !token || !safeEqual(sha256(token), stored)) throw notFound('Conversation');
    return id;
  };

  const friendlyError = () => {
    const { brand } = settings.get();
    return `Sorry, I'm having trouble reaching the assistant right now. Please try again in a moment, or contact ${brand.supportEmail}.`;
  };

  router.get(
    '/config',
    handler((_req, res) => {
      const { assistant, brand, widget } = settings.get();
      res.json({
        assistantName: assistant.name,
        welcomeMessage: assistant.welcomeMessage,
        suggestions: assistant.suggestions,
        brandName: brand.name,
        tagline: brand.tagline,
        supportEmail: brand.supportEmail,
        supportPhone: brand.supportPhone,
        supportHours: brand.supportHours,
        accentColor: widget.accentColor,
        available: llm.configured,
        maxMessageLength: config.chat.maxMessageLength,
      });
    }),
  );

  router.get(
    '/catalog',
    handler((_req, res) => {
      const { brand } = settings.get();
      const entries = knowledge.all({ enabledOnly: true });
      res.json({
        brand: {
          name: brand.name,
          tagline: brand.tagline,
          about: brand.about,
          uniqueSellingPoints: brand.uniqueSellingPoints,
          supportEmail: brand.supportEmail,
          supportPhone: brand.supportPhone,
          supportHours: brand.supportHours,
          currency: brand.currency,
        },
        products: entries.flatMap((e) => (e.type === 'product' ? [{ id: e.id, name: e.title, ...e.data }] : [])),
        policies: entries.flatMap((e) => (e.type === 'policy' ? [{ id: e.id, title: e.title, summary: e.data.summary }] : [])),
      });
    }),
  );

  router.post(
    '/conversations',
    writeLimiter,
    handler((_req, res) => {
      const visitorToken = newToken();
      const id = chat.start('widget', sha256(visitorToken));
      res.status(201).json({ id, visitorToken });
    }),
  );

  router.get(
    '/conversations/:id',
    handler((req, res) => {
      const id = authorizeVisitor(req);
      res.json({
        id,
        status: conversations.get(id)?.status,
        messages: conversations.messages(id).map(publicMessage),
      });
    }),
  );

  router.post(
    '/conversations/:id/messages',
    chatLimiter,
    handler(async (req, res) => {
      const id = authorizeVisitor(req);
      const { content } = parse(messageBody, req.body);
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
          send('done', { message: publicMessage(reply) });
        },
        friendlyError,
      );
    }),
  );

  router.post(
    '/conversations/:id/retry',
    chatLimiter,
    handler(async (req, res) => {
      const id = authorizeVisitor(req);
      await streamResponse(
        req,
        res,
        log,
        async (send, signal) => {
          const reply = await chat.retry(id, { onDelta: (text) => send('delta', { text }) }, signal);
          send('done', { message: publicMessage(reply) });
        },
        friendlyError,
      );
    }),
  );

  router.post(
    '/conversations/:id/messages/:messageId/feedback',
    writeLimiter,
    handler((req, res) => {
      const id = authorizeVisitor(req);
      const { value } = parse(z.object({ value: z.union([z.literal(1), z.literal(-1), z.null()]) }), req.body);
      const message = conversations.message(req.params.messageId!);
      if (!message || message.conversationId !== id) throw notFound('Message');
      if (message.role !== 'assistant') throw new AppError(400, 'invalid_target', 'Only replies can be rated.');
      conversations.setFeedback(message.id, value);
      res.status(204).end();
    }),
  );

  router.post(
    '/conversations/:id/handoff',
    writeLimiter,
    handler((req, res) => {
      const id = authorizeVisitor(req);
      const handoff = handoffs.request(id, parse(handoffBody, req.body));
      const { brand } = settings.get();
      res.status(201).json({ id: handoff.id, status: handoff.status, supportHours: brand.supportHours });
    }),
  );

  return router;
}
