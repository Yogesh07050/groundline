// Workspace settings: the assistant persona, the brand facts it escalates with,
// and widget appearance. Stored as one validated JSON document.
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import type { Db } from '../../db/client.js';

const text = (max: number) => z.string().trim().min(1, 'Required').max(max);

export const settingsSchema = z.object({
  assistant: z.object({
    name: text(40),
    welcomeMessage: text(500),
    suggestions: z.array(text(120)).max(6),
    /** Null follows GROQ_MODEL from the environment. */
    model: z.string().trim().min(1).max(120).nullable(),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().min(50).max(8000),
  }),
  brand: z.object({
    name: text(80),
    tagline: z.string().trim().max(160),
    about: z.string().trim().max(1500),
    uniqueSellingPoints: z.array(text(240)).max(12),
    supportEmail: z.email('Enter a valid email address'),
    supportPhone: z.string().trim().max(40),
    supportHours: z.string().trim().max(120),
    handoffNote: z.string().trim().max(300),
    website: z.union([z.url('Enter a full URL, including https://'), z.literal('')]),
    currency: z.string().trim().length(3, 'Use a 3-letter currency code').toUpperCase(),
  }),
  widget: z.object({
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color, like #0f5c4a'),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

export function createSettingsService(db: Db, config: AppConfig) {
  const read = () => {
    const row = db.prepare('SELECT data FROM settings WHERE id = 1').get() as { data: string } | undefined;
    if (!row) throw new Error('Settings have not been seeded.');
    return settingsSchema.parse(JSON.parse(row.data));
  };

  return {
    get: read,
    save(next: Settings): Settings {
      db.prepare(
        `INSERT INTO settings (id, data, updated_at) VALUES (1, @data, @now)
         ON CONFLICT(id) DO UPDATE SET data = @data, updated_at = @now`,
      ).run({ data: JSON.stringify(next), now: new Date().toISOString() });
      return next;
    },
    effectiveModel: (settings: Settings = read()) => settings.assistant.model ?? config.groq.model,
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
