// Small helpers shared by route modules.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from './errors.js';

export const handler =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };

/** Parse input against a schema, or throw a 400 carrying per-field messages. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  const first = result.error.issues[0];
  const message = first ? (first.path.length ? `${first.path.join('.')}: ${first.message}` : first.message) : 'Invalid input.';
  throw new AppError(400, 'validation_error', message, { fields });
}

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Escape a user string for use inside `LIKE ? ESCAPE '\'`. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Serialize rows to CSV, neutralising spreadsheet formula injection. */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
