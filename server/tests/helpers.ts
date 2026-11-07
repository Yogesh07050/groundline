// Test harness: the real app with an in-memory database. The model is the only
// fake, since it's an external paid service; everything else runs for real.
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config as baseConfig, type AppConfig } from '../src/config/env.js';
import { openDatabase } from '../src/db/client.js';
import { seedDatabase } from '../src/db/seed.js';
import { logger } from '../src/lib/logger.js';
import { AppError } from '../src/lib/errors.js';
import type { LlmChunk, LlmClient, LlmRequest } from '../src/modules/chat/llm.js';

export const ADMIN = { email: 'admin@test.local', password: 'correct-horse-battery' };

export class ScriptedLlm implements LlmClient {
  configured = true;
  requests: LlmRequest[] = [];
  reply: string | (() => string) = 'Scripted reply.';
  failure: AppError | null = null;
  models = ['openai/gpt-oss-120b', 'other/model'];

  async *stream(req: LlmRequest): AsyncIterable<LlmChunk> {
    this.requests.push(req);
    if (this.failure) throw this.failure;
    const text = typeof this.reply === 'function' ? this.reply() : this.reply;
    for (const word of text.split(/(?<= )/)) yield { type: 'delta', text: word };
    yield { type: 'usage', promptTokens: 100, completionTokens: 20 };
  }

  async listModels() {
    return this.models;
  }

  get lastRequest() {
    return this.requests.at(-1)!;
  }
}

export function buildTestApp(overrides: Partial<AppConfig> = {}) {
  const config: AppConfig = {
    ...baseConfig,
    databasePath: ':memory:',
    rateLimit: { windowMs: 60_000, max: 1000 },
    auth: { ...baseConfig.auth, adminEmail: ADMIN.email, adminPassword: ADMIN.password, cookieSecure: false },
    ...overrides,
  };
  const db = openDatabase(':memory:');
  seedDatabase(db, config, logger);
  const llm = new ScriptedLlm();
  const app = createApp({ db, llm, config, log: logger });
  return { app, db, llm, config };
}

export async function signIn(app: ReturnType<typeof buildTestApp>['app']) {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send(ADMIN).expect(200);
  return agent;
}

export interface SseEvent {
  event: string;
  data: any;
}

export function parseSse(body: string): SseEvent[] {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? '';
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? 'null';
      return { event, data: JSON.parse(data) };
    });
}

/** Start a visitor conversation and return a helper bound to its token. */
export async function startVisitor(app: ReturnType<typeof buildTestApp>['app']) {
  const { body } = await request(app).post('/api/v1/public/conversations').expect(201);
  const headers = { 'X-Visitor-Token': body.visitorToken as string };
  return {
    id: body.id as string,
    token: body.visitorToken as string,
    headers,
    async say(content: string) {
      const res = await request(app)
        .post(`/api/v1/public/conversations/${body.id}/messages`)
        .set(headers)
        .send({ content })
        .buffer(true)
        .parse((response, done) => {
          let text = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => (text += chunk));
          response.on('end', () => done(null, text));
        });
      return { res, events: res.status === 200 ? parseSse(res.body as string) : [] };
    },
  };
}
