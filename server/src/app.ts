// Composition root: builds every service from its dependencies and mounts routes.
// Taking the database and LLM client as arguments lets tests run the entire app
// against an in-memory database and a scripted model.
import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { type AppConfig, repoRoot, serverDir } from './config/env.js';
import type { Db } from './db/client.js';
import { newId } from './lib/crypto.js';
import { handler } from './lib/http.js';
import type { Logger } from './lib/logger.js';
import { publicCors } from './middleware/cors.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import { createLimiter } from './middleware/rateLimit.js';
import { adminRoutes } from './modules/adminRoutes.js';
import { createAnalyticsService } from './modules/analytics/service.js';
import { requireAuth } from './modules/auth/middleware.js';
import { authRoutes } from './modules/auth/routes.js';
import { createAuthService } from './modules/auth/service.js';
import type { LlmClient } from './modules/chat/llm.js';
import { createChatService } from './modules/chat/service.js';
import { createConversationRepository } from './modules/conversations/repository.js';
import { conversationRoutes } from './modules/conversations/routes.js';
import { createHandoffService } from './modules/handoffs/service.js';
import { createImportService } from './modules/knowledge/importer.js';
import { knowledgeRoutes } from './modules/knowledge/routes.js';
import { createKnowledgeService } from './modules/knowledge/service.js';
import { publicRoutes } from './modules/publicApi/routes.js';
import { createRetrievalService, type RetrievalService } from './modules/retrieval/service.js';
import { createSettingsService } from './modules/settings/service.js';

export function createServices(db: Db, llm: LlmClient, config: AppConfig) {
  // The retrieval index is rebuilt lazily after any knowledge write.
  let retrieval: RetrievalService | undefined;
  const knowledge = createKnowledgeService(db, () => retrieval?.invalidate());
  retrieval = createRetrievalService(() => knowledge.all({ enabledOnly: true }), config.chat.retrievedDocuments);

  const settings = createSettingsService(db, config);
  const conversations = createConversationRepository(db);
  const chat = createChatService({ conversations, retrieval, settings, llm, chat: config.chat });

  return {
    knowledge,
    retrieval,
    settings,
    conversations,
    chat,
    imports: createImportService(db, knowledge),
    auth: createAuthService(db, config),
    handoffs: createHandoffService(db),
    analytics: createAnalyticsService(db),
  };
}

export function createApp(deps: { db: Db; llm: LlmClient; config: AppConfig; log: Logger }) {
  const { db, llm, config, log } = deps;
  const services = createServices(db, llm, config);
  const { auth, conversations, handoffs, imports, knowledge, retrieval, settings, analytics, chat } = services;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    pinoHttp({
      logger: log,
      genReqId: () => newId('req'),
      autoLogging: { ignore: (req) => req.url === '/health' || !req.url?.startsWith('/api') },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );

  // Streamed replies must reach the client token by token, so they skip compression.
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/messages') && !req.path.endsWith('/retry') && compression.filter(req, res) }));
  app.use(express.json({ limit: '256kb' }));

  app.get(
    '/health',
    handler((_req, res) => {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', llmConfigured: llm.configured });
    }),
  );

  // The widget is loaded by other sites, so it opts out of the same-origin default.
  app.get('/widget.js', (_req, res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('application/javascript').sendFile(path.join(serverDir, 'widget', 'widget.js'));
  });

  const api = express.Router();
  const chatLimiter = createLimiter({
    ...config.rateLimit,
    message: "You're sending messages a little too quickly. Please wait a moment and try again.",
  });
  const writeLimiter = createLimiter({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max * 2,
    message: 'Too many requests. Please wait a moment and try again.',
  });
  const loginLimiter = createLimiter({
    windowMs: 15 * 60_000,
    max: 20,
    message: 'Too many attempts. Please wait a few minutes and try again.',
  });

  api.use('/auth', authRoutes(auth, config, loginLimiter));
  api.use(
    '/public',
    publicCors(config.allowedOrigins),
    publicRoutes({ chat, conversations, handoffs, knowledge, settings, llm, config, log, chatLimiter, writeLimiter }),
  );

  const admin = express.Router();
  admin.use(requireAuth(auth));
  admin.use('/knowledge', knowledgeRoutes(knowledge, imports, retrieval));
  admin.use('/conversations', conversationRoutes(conversations, handoffs));
  admin.use(adminRoutes({ analytics, handoffs, settings, chat, conversations, llm, config, log }));
  api.use('/admin', admin);

  api.use(apiNotFound);
  app.use('/api/v1', api);
  app.use('/api', apiNotFound);

  // In production the API also serves the built frontend.
  const webDist = path.join(repoRoot, 'web', 'dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler(log));
  return app;
}
