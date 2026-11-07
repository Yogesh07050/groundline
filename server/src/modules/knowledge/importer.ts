// File import: parse → validate each row → plan (create / update / unchanged) →
// commit atomically. A dry run stops after planning, which powers the preview.
import { parse as parseCsv } from 'csv-parse/sync';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { newId } from '../../lib/crypto.js';
import { knowledgeInput, type KnowledgeInput, type KnowledgeType } from './schemas.js';
import type { KnowledgeService } from './service.js';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;
const LIST_SEPARATOR = '|';
const SPEC_PREFIX = 'spec:';

export type RowAction = 'create' | 'update' | 'unchanged';

export interface PlannedRow {
  row: number;
  type: KnowledgeType;
  title: string;
  action: RowAction;
}

export interface RowError {
  row: number;
  title: string | null;
  messages: string[];
}

export interface ImportPlan {
  filename: string;
  format: 'csv' | 'json';
  rows: PlannedRow[];
  errors: RowError[];
  summary: { create: number; update: number; unchanged: number; failed: number };
}

type RawRow = { row: number; value: unknown };

// --- Parsing -----------------------------------------------------------------

const splitList = (value: string | undefined) =>
  (value ?? '')
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);

function csvRowToInput(record: Record<string, string>): unknown {
  const type = record.type?.trim().toLowerCase() || inferCsvType(record);
  const enabled = !['false', 'no', '0'].includes((record.enabled ?? '').trim().toLowerCase());
  const base = { type, enabled };

  if (type === 'product') {
    const specs: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith(SPEC_PREFIX) && value?.trim()) specs[key.slice(SPEC_PREFIX.length).trim()] = value.trim();
    }
    const rawPrice = (record.price ?? '').replace(/[$,\s]/g, '');
    return {
      ...base,
      title: record.title ?? record.name,
      data: {
        category: record.category,
        price: rawPrice === '' || Number.isNaN(Number(rawPrice)) ? undefined : Number(rawPrice),
        availability: record.availability,
        colors: splitList(record.colors),
        shortDescription: record.shortDescription ?? record.description,
        highlights: splitList(record.highlights),
        specs,
        bestFor: record.bestFor ?? '',
        warranty: record.warranty ?? '',
      },
    };
  }
  if (type === 'policy') {
    return { ...base, title: record.title, data: { summary: record.summary, details: splitList(record.details) } };
  }
  if (type === 'faq') {
    return { ...base, title: record.title ?? record.question, data: { answer: record.answer } };
  }
  return { ...base, title: record.title ?? record.name ?? record.question };
}

function inferCsvType(record: Record<string, string>): string {
  if ('question' in record || 'answer' in record) return 'faq';
  if ('price' in record || 'category' in record) return 'product';
  if ('summary' in record) return 'policy';
  return '';
}

function parseCsvFile(text: string): RawRow[] {
  let records: Array<Record<string, string>>;
  try {
    records = parseCsv(text, { columns: (h: string[]) => h.map((c) => c.trim()), skip_empty_lines: true, trim: true, bom: true });
  } catch (err) {
    throw new AppError(422, 'unreadable_file', `This CSV couldn't be read: ${(err as Error).message}`);
  }
  // Row numbers match what a spreadsheet shows: the header is row 1.
  return records.map((value, index) => ({ row: index + 2, value: csvRowToInput(value) }));
}

// Accepts `[{ type, title, data }]`, the console's own export format, or
// grouped `{ products: [...], policies: [...], faqs: [...] }`.
function parseJsonFile(text: string): RawRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    throw new AppError(422, 'unreadable_file', `This JSON couldn't be read: ${(err as Error).message}`);
  }

  const grouped = z
    .object({
      products: z.array(z.record(z.string(), z.unknown())).optional(),
      policies: z.array(z.record(z.string(), z.unknown())).optional(),
      faqs: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .safeParse(parsed);

  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (grouped.success && (grouped.data.products || grouped.data.policies || grouped.data.faqs)) {
    const fromGroup = (type: KnowledgeType, list: Array<Record<string, unknown>> = []) =>
      list.map((item) => ('data' in item ? { type, ...item } : flatten(type, item)));
    items = [
      ...fromGroup('product', grouped.data.products),
      ...fromGroup('policy', grouped.data.policies),
      ...fromGroup('faq', grouped.data.faqs),
    ];
  } else {
    throw new AppError(
      422,
      'unrecognized_format',
      'Expected a JSON array of entries, or an object with "products", "policies", or "faqs".',
    );
  }
  return items.map((value, index) => ({ row: index + 1, value }));
}

function flatten(type: KnowledgeType, item: Record<string, unknown>) {
  const { title, name, question, enabled, ...data } = item;
  return { type, title: title ?? name ?? question, enabled: enabled ?? true, data };
}

function parseFile(filename: string, buffer: Buffer): { format: 'csv' | 'json'; rows: RawRow[] } {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension !== 'csv' && extension !== 'json') {
    throw new AppError(415, 'unsupported_file_type', 'Upload a .csv or .json file.');
  }
  if (buffer.length === 0) throw new AppError(422, 'empty_file', 'This file is empty.');

  const text = buffer.toString('utf8');
  if (text.includes('�') || text.includes('\0')) {
    throw new AppError(422, 'unreadable_file', 'This file is not UTF-8 text. Re-save it as UTF-8 and try again.');
  }

  const rows = extension === 'csv' ? parseCsvFile(text) : parseJsonFile(text);
  if (rows.length === 0) throw new AppError(422, 'empty_file', 'No rows found in this file.');
  if (rows.length > MAX_ROWS) {
    throw new AppError(413, 'too_many_rows', `This file has ${rows.length} rows; the limit is ${MAX_ROWS} per import.`);
  }
  return { format: extension, rows };
}

// --- Planning & commit -------------------------------------------------------

const sameContent = (a: KnowledgeInput, b: KnowledgeInput) =>
  a.title === b.title && a.enabled === b.enabled && stable(a.data) === stable(b.data);

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );

function titleOf(value: unknown): string | null {
  const title = (value as { title?: unknown } | null)?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

interface Planned {
  plan: ImportPlan;
  writes: Array<{ action: 'create'; input: KnowledgeInput } | { action: 'update'; id: string; input: KnowledgeInput }>;
}

function buildPlan(knowledge: KnowledgeService, filename: string, buffer: Buffer): Planned {
  const { format, rows } = parseFile(filename, buffer);
  const planned: PlannedRow[] = [];
  const errors: RowError[] = [];
  const writes: Planned['writes'] = [];
  const seen = new Map<string, number>();

  for (const { row, value } of rows) {
    const result = knowledgeInput.safeParse(value);
    if (!result.success) {
      errors.push({
        row,
        title: titleOf(value),
        messages: result.error.issues.map((i) => {
          const field = i.path.filter((p) => p !== 'data').join('.');
          return field === 'type'
            ? 'Type must be product, policy, or faq.'
            : field
              ? `${field}: ${i.message}`
              : i.message;
        }),
      });
      continue;
    }

    const input = result.data;
    const key = `${input.type}:${input.title.toLowerCase()}`;
    const firstRow = seen.get(key);
    if (firstRow !== undefined) {
      errors.push({ row, title: input.title, messages: [`Duplicate of row ${firstRow} in this file.`] });
      continue;
    }
    seen.set(key, row);

    const existing = knowledge.findByTitle(input.type, input.title);
    let action: RowAction = 'create';
    if (existing) action = sameContent(existing, input) ? 'unchanged' : 'update';

    planned.push({ row, type: input.type, title: input.title, action });
    if (action === 'create') writes.push({ action, input });
    if (action === 'update' && existing) writes.push({ action, id: existing.id, input });
  }

  const count = (action: RowAction) => planned.filter((r) => r.action === action).length;
  return {
    writes,
    plan: {
      filename,
      format,
      rows: planned,
      errors,
      summary: { create: count('create'), update: count('update'), unchanged: count('unchanged'), failed: errors.length },
    },
  };
}

export function createImportService(db: Db, knowledge: KnowledgeService) {
  return {
    preview: (filename: string, buffer: Buffer) => buildPlan(knowledge, filename, buffer).plan,

    commit(filename: string, buffer: Buffer, importedBy: string): ImportPlan {
      const { plan, writes } = buildPlan(knowledge, filename, buffer);
      if (writes.length === 0 && plan.errors.length > 0) {
        throw new AppError(422, 'nothing_to_import', 'None of the rows in this file are valid.', {
          errors: plan.errors,
        });
      }
      knowledge.batch((writer) => {
        for (const write of writes) {
          if (write.action === 'create') writer.create(write.input);
          else writer.update(write.id, write.input);
        }
        db.prepare(
          `INSERT INTO kb_imports (id, filename, format, created_count, updated_count, unchanged_count,
             failed_count, errors, imported_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newId('imp'),
          filename.slice(0, 200),
          plan.format,
          plan.summary.create,
          plan.summary.update,
          plan.summary.unchanged,
          plan.summary.failed,
          JSON.stringify(plan.errors),
          importedBy,
          new Date().toISOString(),
        );
      });
      return plan;
    },

    history() {
      const rows = db.prepare('SELECT * FROM kb_imports ORDER BY created_at DESC LIMIT 20').all() as Array<{
        id: string;
        filename: string;
        format: string;
        created_count: number;
        updated_count: number;
        unchanged_count: number;
        failed_count: number;
        errors: string;
        imported_by: string;
        created_at: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        format: r.format,
        created: r.created_count,
        updated: r.updated_count,
        unchanged: r.unchanged_count,
        failed: r.failed_count,
        errors: JSON.parse(r.errors) as RowError[],
        importedBy: r.imported_by,
        createdAt: r.created_at,
      }));
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;

export const csvTemplates: Record<KnowledgeType, string> = {
  product:
    'name,category,price,availability,colors,shortDescription,highlights,bestFor,warranty,spec:weight,spec:battery\r\n' +
    'Example Headphones,Over-ear headphones,199,In stock,Black|Silver,"One sentence that describes the product.",First highlight|Second highlight,Commuting and travel,2 years,250g,30h\r\n',
  policy:
    'title,summary,details\r\n' +
    'Shipping,"Orders over $50 ship free within the US.",Standard: 3-5 business days|Express: 1-2 business days\r\n',
  faq: 'question,answer\r\nDo you ship internationally?,"Yes, to Canada and the EU."\r\n',
};
