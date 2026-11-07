// Validated runtime configuration. All environment access goes through here, so
// a bad value stops the server at boot with a readable message rather than
// surfacing later as a confusing runtime error.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const serverRoot = fileURLToPath(new URL('../../', import.meta.url));
export const repoRoot = path.resolve(serverRoot, '..');
export const serverDir = serverRoot;

if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });
}

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());
const withDefault = <T extends z.ZodTypeAny>(schema: T, fallback: z.input<T>) =>
  z.preprocess(emptyToUndefined, schema.default(fallback as never));

const schema = z.object({
  NODE_ENV: withDefault(z.enum(['development', 'test', 'production']), 'development'),
  PORT: withDefault(z.coerce.number().int().min(0).max(65535), 3000),
  LOG_LEVEL: withDefault(z.enum(['silent', 'error', 'warn', 'info', 'debug']), 'info'),
  DATABASE_PATH: withDefault(z.string(), 'data/groundline.db'),

  GROQ_API_KEY: optional(z.string()),
  GROQ_MODEL: withDefault(z.string(), 'openai/gpt-oss-120b'),
  GROQ_TEMPERATURE: withDefault(z.coerce.number().min(0).max(2), 0.3),
  GROQ_MAX_TOKENS: withDefault(z.coerce.number().int().min(50).max(8000), 700),
  GROQ_TIMEOUT_SECONDS: withDefault(z.coerce.number().positive(), 45),

  RATE_LIMIT_WINDOW_MINUTES: withDefault(z.coerce.number().positive(), 1),
  RATE_LIMIT_MAX_REQUESTS: withDefault(z.coerce.number().int().positive(), 20),

  ADMIN_EMAIL: withDefault(z.email(), 'admin@groundline.local'),
  ADMIN_PASSWORD: optional(z.string().min(10, 'must be at least 10 characters')),
  SESSION_TTL_HOURS: withDefault(z.coerce.number().positive(), 168),
  COOKIE_SECURE: optional(z.enum(['true', 'false'])),

  // Origins allowed to embed the widget. "*" is safe here because public routes
  // use a per-conversation token rather than cookies.
  ALLOWED_ORIGINS: withDefault(z.string(), '*'),
  // Number of reverse proxies in front of the app, so per-IP limits see real IPs.
  TRUST_PROXY: withDefault(z.coerce.number().int().min(0), 0),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  const apiKey = env.GROQ_API_KEY && env.GROQ_API_KEY !== 'your_groq_api_key_here' ? env.GROQ_API_KEY : '';

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databasePath:
      env.DATABASE_PATH === ':memory:' ? ':memory:' : path.resolve(repoRoot, env.DATABASE_PATH),
    groq: {
      apiKey,
      model: env.GROQ_MODEL,
      temperature: env.GROQ_TEMPERATURE,
      maxTokens: env.GROQ_MAX_TOKENS,
      timeoutMs: env.GROQ_TIMEOUT_SECONDS * 1000,
    },
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60_000,
      max: env.RATE_LIMIT_MAX_REQUESTS,
    },
    auth: {
      adminEmail: env.ADMIN_EMAIL,
      adminPassword: env.ADMIN_PASSWORD,
      sessionTtlMs: env.SESSION_TTL_HOURS * 3_600_000,
      cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
    },
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY,
    // Server-side conversation guards, independent of any client.
    chat: {
      maxMessageLength: 1000,
      maxHistoryMessages: 12,
      maxMessagesPerConversation: 200,
      retrievedDocuments: 6,
    },
  };
}

export type AppConfig = ReturnType<typeof load>;
export const config: AppConfig = load();
