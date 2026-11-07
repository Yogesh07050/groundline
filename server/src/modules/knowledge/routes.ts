import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { handler, pageQuery, parse } from '../../lib/http.js';
import { currentUser } from '../auth/middleware.js';
import type { RetrievalService } from '../retrieval/service.js';
import { csvTemplates, type ImportService, MAX_IMPORT_BYTES } from './importer.js';
import { knowledgeInput, type KnowledgeType } from './schemas.js';
import type { KnowledgeService } from './service.js';

const listQuery = pageQuery.extend({
  type: z.enum(['product', 'policy', 'faq']).optional(),
  enabled: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['title', 'updated']).default('title'),
});

export function knowledgeRoutes(knowledge: KnowledgeService, imports: ImportService, retrieval: RetrievalService) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } });

  const uploaded = (file: Express.Multer.File | undefined) => {
    if (!file) throw new AppError(400, 'missing_file', 'Choose a file to upload.');
    // multer decodes filenames as latin1; recover UTF-8 names.
    return { name: Buffer.from(file.originalname, 'latin1').toString('utf8'), buffer: file.buffer };
  };

  router.get(
    '/',
    handler((req, res) => {
      const { q, ...query } = parse(listQuery, req.query);
      res.json({ ...knowledge.list({ ...query, q: q || undefined }), counts: knowledge.counts() });
    }),
  );

  router.post(
    '/',
    handler((req, res) => {
      res.status(201).json(knowledge.create(parse(knowledgeInput, req.body)));
    }),
  );

  // --- Literal paths first, so they aren't captured by "/:id" ------------------

  router.get(
    '/retrieval-test',
    handler((req, res) => {
      const { q } = parse(z.object({ q: z.string().trim().min(1, 'Enter a question').max(1000) }), req.query);
      res.json({ results: retrieval.search(q) });
    }),
  );

  router.get(
    '/export',
    handler((_req, res) => {
      const entries = knowledge.all().map(({ type, title, enabled, data }) => ({ type, title, enabled, data }));
      res
        .setHeader('Content-Disposition', 'attachment; filename="knowledge-base.json"')
        .type('application/json')
        .send(JSON.stringify(entries, null, 2));
    }),
  );

  router.get(
    '/templates/:type',
    handler((req, res) => {
      const type = parse(z.enum(['product', 'policy', 'faq']), req.params.type) as KnowledgeType;
      res
        .setHeader('Content-Disposition', `attachment; filename="${type}-template.csv"`)
        .type('text/csv')
        .send(csvTemplates[type]);
    }),
  );

  router.get(
    '/imports',
    handler((_req, res) => {
      res.json({ items: imports.history() });
    }),
  );

  router.post(
    '/imports/preview',
    upload.single('file'),
    handler((req, res) => {
      const file = uploaded(req.file);
      res.json(imports.preview(file.name, file.buffer));
    }),
  );

  router.post(
    '/imports',
    upload.single('file'),
    handler((req, res) => {
      const file = uploaded(req.file);
      res.status(201).json(imports.commit(file.name, file.buffer, currentUser(req).email));
    }),
  );

  // --- Single entry ------------------------------------------------------------

  router.get(
    '/:id',
    handler((req, res) => {
      res.json(knowledge.get(req.params.id!));
    }),
  );

  router.put(
    '/:id',
    handler((req, res) => {
      res.json(knowledge.update(req.params.id!, parse(knowledgeInput, req.body)));
    }),
  );

  router.patch(
    '/:id',
    handler((req, res) => {
      const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
      res.json(knowledge.setEnabled(req.params.id!, enabled));
    }),
  );

  router.delete(
    '/:id',
    handler((req, res) => {
      knowledge.remove(req.params.id!);
      res.status(204).end();
    }),
  );

  return router;
}
