import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, buildTestApp, signIn, startVisitor } from './helpers.js';

let ctx: ReturnType<typeof buildTestApp>;
const faq = (title: string, answer = 'An answer.') => ({ type: 'faq', title, enabled: true, data: { answer } });

beforeEach(() => {
  ctx = buildTestApp();
});

describe('auth', () => {
  it.each([
    ['get', '/api/v1/admin/knowledge'],
    ['get', '/api/v1/admin/conversations'],
    ['get', '/api/v1/admin/analytics/overview'],
    ['get', '/api/v1/admin/settings'],
    ['post', '/api/v1/admin/playground/conversations'],
  ] as const)('requires a session for %s %s', async (method, url) => {
    const res = await request(ctx.app)[method](url);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  it('rejects wrong credentials with the same message for known and unknown emails', async () => {
    const wrong = await request(ctx.app).post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'nope' }).expect(401);
    const unknown = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'x@y.co', password: 'nope' }).expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('sets an http-only cookie, and logout ends the session', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send(ADMIN).expect(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    expect(res.headers['set-cookie']?.[0]).toMatch(/SameSite=Lax/i);

    const agent = await signIn(ctx.app);
    await agent.get('/api/v1/auth/me').expect(200);
    await agent.post('/api/v1/auth/logout').expect(204);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('stores no plaintext session tokens or passwords', async () => {
    await signIn(ctx.app);
    const user = ctx.db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(user.password_hash).toMatch(/^scrypt\$/);
    expect(user.password_hash).not.toContain(ADMIN.password);
  });

  it('blocks cross-site writes even with a valid session', async () => {
    const agent = await signIn(ctx.app);
    await agent.post('/api/v1/admin/knowledge').set('Origin', 'https://evil.example').send(faq('Q?')).expect(403);
  });

  it('changes the password and signs out other sessions', async () => {
    const first = await signIn(ctx.app);
    const second = await signIn(ctx.app);
    await first
      .post('/api/v1/auth/password')
      .send({ currentPassword: 'wrong', newPassword: 'a-brand-new-password' })
      .expect(400);
    await first
      .post('/api/v1/auth/password')
      .send({ currentPassword: ADMIN.password, newPassword: 'a-brand-new-password' })
      .expect(204);
    await first.get('/api/v1/auth/me').expect(200);
    await second.get('/api/v1/auth/me').expect(401);
    await request(ctx.app).post('/api/v1/auth/login').send(ADMIN).expect(401);
  });
});

describe('knowledge', () => {
  it('seeds the original catalog', async () => {
    const admin = await signIn(ctx.app);
    const res = await admin.get('/api/v1/admin/knowledge?pageSize=100').expect(200);
    expect(res.body.total).toBe(20);
    expect(res.body.counts).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'product', total: 6 })]),
    );
  });

  it('searches and filters on real entries', async () => {
    const admin = await signIn(ctx.app);
    const byType = await admin.get('/api/v1/admin/knowledge?type=policy').expect(200);
    expect(byType.body.total).toBe(6);
    const byText = await admin.get('/api/v1/admin/knowledge?q=IP67').expect(200);
    expect(byText.body.items.map((e: { id: string }) => e.id)).toEqual(['nimbus-pebble-speaker']);
    // LIKE wildcards are matched literally.
    const wildcard = await admin.get('/api/v1/admin/knowledge?q=%25').expect(200);
    expect(wildcard.body.total).toBeLessThan(20);
  });

  it('feeds edits straight into what the assistant knows', async () => {
    const admin = await signIn(ctx.app);
    const created = await admin
      .post('/api/v1/admin/knowledge')
      .send(faq('Do you offer gift wrapping?', 'Yes, gift wrapping costs $4.'))
      .expect(201);
    const visitor = await startVisitor(ctx.app);
    await visitor.say('Can I get gift wrapping?');
    expect(ctx.llm.lastRequest.messages[0]?.content).toContain('gift wrapping costs $4');

    await admin.patch(`/api/v1/admin/knowledge/${created.body.id}`).send({ enabled: false }).expect(200);
    await visitor.say('Can I get gift wrapping?');
    expect(ctx.llm.lastRequest.messages[0]?.content).not.toContain('gift wrapping costs $4');

    await admin.delete(`/api/v1/admin/knowledge/${created.body.id}`).expect(204);
    await admin.get(`/api/v1/admin/knowledge/${created.body.id}`).expect(404);
  });

  it('returns field errors for invalid entries', async () => {
    const admin = await signIn(ctx.app);
    const res = await admin
      .post('/api/v1/admin/knowledge')
      .send({ type: 'product', title: '', enabled: true, data: { price: -5 } })
      .expect(400);
    expect(res.body.error.details.fields.title).toBeTruthy();
    expect(res.body.error.details.fields['data.price']).toBeTruthy();
  });

  it('rejects duplicate titles and type changes', async () => {
    const admin = await signIn(ctx.app);
    const dup = await admin.post('/api/v1/admin/knowledge').send(faq('IS THERE A MOBILE APP?')).expect(409);
    expect(dup.body.error.details.fields.title).toBeTruthy();
    await admin
      .put('/api/v1/admin/knowledge/nimbus-grove-home')
      .send(faq('Now a FAQ'))
      .expect(400);
  });
});

describe('knowledge import', () => {
  const upload = (agent: Awaited<ReturnType<typeof signIn>>, name: string, content: string, path = 'imports/preview') =>
    agent.post(`/api/v1/admin/knowledge/${path}`).attach('file', Buffer.from(content), name);

  it('previews a CSV without writing, then commits it', async () => {
    const admin = await signIn(ctx.app);
    const csv =
      'question,answer\n' +
      'Do you sell gift cards?,"Yes, from $25."\n' +
      'Is there a mobile app?,Updated answer.\n' +
      ',No question here\n';

    const preview = await upload(admin, 'faqs.csv', csv).expect(200);
    expect(preview.body.summary).toEqual({ create: 1, update: 1, unchanged: 0, failed: 1 });
    expect(preview.body.errors[0].row).toBe(4);

    const before = await admin.get('/api/v1/admin/knowledge?type=faq');
    expect(before.body.total).toBe(8);

    await upload(admin, 'faqs.csv', csv, 'imports').expect(201);
    const after = await admin.get('/api/v1/admin/knowledge?type=faq&q=gift');
    expect(after.body.total).toBe(1);
    const app = await admin.get('/api/v1/admin/knowledge/faq-5');
    expect(app.body.data.answer).toBe('Updated answer.');

    const history = await admin.get('/api/v1/admin/knowledge/imports');
    expect(history.body.items[0]).toMatchObject({ filename: 'faqs.csv', created: 1, updated: 1, failed: 1 });
  });

  it('imports products with list and spec columns, and reports re-imports as unchanged', async () => {
    const admin = await signIn(ctx.app);
    const csv =
      'name,category,price,availability,colors,shortDescription,highlights,bestFor,warranty,spec:weight\n' +
      'Test Phones,Headphones,"$1,299",In stock,Black|Red,A description.,One|Two,Testing,1 year,200g\n';
    await upload(admin, 'p.csv', csv, 'imports').expect(201);
    const found = await admin.get('/api/v1/admin/knowledge/test-phones').expect(200);
    expect(found.body.data).toMatchObject({ price: 1299, colors: ['Black', 'Red'], specs: { weight: '200g' } });

    const again = await upload(admin, 'p.csv', csv).expect(200);
    expect(again.body.summary.unchanged).toBe(1);
  });

  it('round-trips the JSON export without changes', async () => {
    const admin = await signIn(ctx.app);
    const exported = await admin.get('/api/v1/admin/knowledge/export').buffer(true).expect(200);
    const preview = await upload(admin, 'kb.json', exported.text).expect(200);
    expect(preview.body.summary).toEqual({ create: 0, update: 0, unchanged: 20, failed: 0 });
  });

  it('accepts grouped JSON', async () => {
    const admin = await signIn(ctx.app);
    const file = JSON.stringify({ faqs: [{ question: 'New question?', answer: 'New answer.' }] });
    const preview = await upload(admin, 'kb.json', file).expect(200);
    expect(preview.body.summary.create).toBe(1);
  });

  it.each([
    ['an unsupported type', 'notes.txt', 'hello', 415, 'unsupported_file_type'],
    ['an empty file', 'a.csv', '', 422, 'empty_file'],
    ['broken JSON', 'a.json', '{oops', 422, 'unreadable_file'],
    ['JSON of the wrong shape', 'a.json', '{"foo": 1}', 422, 'unrecognized_format'],
    ['a CSV with uneven columns', 'a.csv', 'question,answer\na,b,c,d\n', 422, 'unreadable_file'],
    ['a header-only CSV', 'a.csv', 'question,answer\n', 422, 'empty_file'],
  ])('rejects %s', async (_label, name, content, status, code) => {
    const admin = await signIn(ctx.app);
    const res = await upload(admin, name, content);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it('rejects oversized files and missing uploads', async () => {
    const admin = await signIn(ctx.app);
    const big = await upload(admin, 'a.csv', 'x'.repeat(2 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
    await admin.post('/api/v1/admin/knowledge/imports/preview').expect(400);
  });

  it('flags duplicate rows in one file and refuses a file with no valid rows', async () => {
    const admin = await signIn(ctx.app);
    const dup = await upload(admin, 'a.csv', 'question,answer\nSame?,One\nsame?,Two\n').expect(200);
    expect(dup.body.errors[0].messages[0]).toContain('Duplicate of row 2');

    const res = await upload(admin, 'a.csv', 'question,answer\n,missing\n', 'imports').expect(422);
    expect(res.body.error.code).toBe('nothing_to_import');
  });
});

describe('conversations', () => {
  it('lists, searches, filters, and shows retrieval sources to operators', async () => {
    const visitor = await startVisitor(ctx.app);
    await visitor.say('What is your return policy?');
    const other = await startVisitor(ctx.app);
    await other.say('Tell me about the Nimbus Pebble');

    const admin = await signIn(ctx.app);
    const all = await admin.get('/api/v1/admin/conversations').expect(200);
    expect(all.body.total).toBe(2);
    const found = await admin.get('/api/v1/admin/conversations?q=pebble').expect(200);
    expect(found.body.items.map((c: { id: string }) => c.id)).toEqual([other.id]);
    const none = await admin.get('/api/v1/admin/conversations?status=resolved').expect(200);
    expect(none.body.total).toBe(0);

    const detail = await admin.get(`/api/v1/admin/conversations/${visitor.id}`).expect(200);
    const reply = detail.body.messages.at(-1);
    expect(reply.sources.map((s: { id: string }) => s.id)).toContain('policy-returns');
    expect(reply.promptTokens).toBe(100);
    expect(reply.model).toBeTruthy();
  });

  it('resolves, reopens on a new message, and deletes', async () => {
    const visitor = await startVisitor(ctx.app);
    await visitor.say('hello');
    const admin = await signIn(ctx.app);
    const url = `/api/v1/admin/conversations/${visitor.id}`;

    await admin.patch(url).send({ status: 'resolved' }).expect(200);
    await visitor.say('one more thing');
    expect((await admin.get(url)).body.conversation.status).toBe('open');

    await admin.delete(url).expect(204);
    await admin.get(url).expect(404);
  });

  it('exports CSV with formula injection neutralised', async () => {
    const visitor = await startVisitor(ctx.app);
    await visitor.say('=HYPERLINK("http://evil")');
    const admin = await signIn(ctx.app);
    const res = await admin.get('/api/v1/admin/conversations/export.csv').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`"'=HYPERLINK`);
  });
});

describe('analytics', () => {
  it('reports real totals, a zero-filled series, top sources, and gaps', async () => {
    const admin = await signIn(ctx.app);
    const empty = await admin.get('/api/v1/admin/analytics/overview?days=7').expect(200);
    expect(empty.body.totals.conversations).toBe(0);
    expect(empty.body.totals.answerRate).toBeNull();
    expect(empty.body.daily).toHaveLength(7);

    const visitor = await startVisitor(ctx.app);
    ctx.llm.reply = 'Returns are free.';
    await visitor.say('What is your return policy?');
    ctx.llm.reply = "I don't have that detail. Please email support@nimbusaudio.com.";
    await visitor.say('Does the Halo ANC support head tracking?');
    ctx.llm.reply = 'I can only help with Nimbus products.';
    await visitor.say('What is the capital of France?');
    ctx.llm.reply = 'Hello!';
    await visitor.say('hi there');

    const res = await admin.get('/api/v1/admin/analytics/overview?days=7').expect(200);
    expect(res.body.totals).toMatchObject({
      conversations: 1,
      customerMessages: 4,
      replies: 4,
      answered: 1,
      referred: 1,
      noMatch: 1,
      smalltalk: 1,
    });
    expect(res.body.totals.answerRate).toBeCloseTo(1 / 3);
    expect(res.body.totals.medianLatencyMs).not.toBeNull();
    expect(res.body.daily.at(-1).conversations).toBe(1);
    expect(res.body.topSources.length).toBeGreaterThan(0);
    expect(res.body.gaps.map((g: { query: string }) => g.query)).toEqual(
      expect.arrayContaining(['Does the Halo ANC support head tracking?', 'What is the capital of France?']),
    );

    const filtered = await admin.get('/api/v1/admin/analytics/overview?channel=playground').expect(200);
    expect(filtered.body.totals.conversations).toBe(0);
  });

  it('groups repeated gaps and hides dismissed ones', async () => {
    ctx.llm.reply = 'Sorry, I can only help with our products.';
    const visitor = await startVisitor(ctx.app);
    await visitor.say('Capital of France?');
    await visitor.say('capital of france');
    const admin = await signIn(ctx.app);

    const gaps = await admin.get('/api/v1/admin/analytics/gaps').expect(200);
    expect(gaps.body.items).toHaveLength(1);
    expect(gaps.body.items[0].count).toBe(2);

    await admin.post('/api/v1/admin/analytics/gaps/dismiss').send({ query: 'capital of France?' }).expect(204);
    expect((await admin.get('/api/v1/admin/analytics/gaps')).body.items).toHaveLength(0);
  });
});

describe('settings and provider', () => {
  it('validates settings and applies them to the assistant', async () => {
    const admin = await signIn(ctx.app);
    const { body } = await admin.get('/api/v1/admin/settings').expect(200);

    const bad = structuredClone(body.settings);
    bad.brand.supportEmail = 'not-an-email';
    bad.widget.accentColor = 'red';
    const rejected = await admin.put('/api/v1/admin/settings').send(bad).expect(400);
    expect(rejected.body.error.details.fields['brand.supportEmail']).toBeTruthy();
    expect(rejected.body.error.details.fields['widget.accentColor']).toBeTruthy();

    const next = structuredClone(body.settings);
    next.assistant.name = 'Echo';
    next.assistant.temperature = 0.1;
    next.assistant.model = 'other/model';
    await admin.put('/api/v1/admin/settings').send(next).expect(200);

    const config = await request(ctx.app).get('/api/v1/public/config').expect(200);
    expect(config.body.assistantName).toBe('Echo');

    const visitor = await startVisitor(ctx.app);
    await visitor.say('hello');
    expect(ctx.llm.lastRequest.temperature).toBe(0.1);
    expect(ctx.llm.lastRequest.model).toBe('other/model');
    expect(ctx.llm.lastRequest.messages[0]?.content).toContain('You are "Echo"');
  });

  it('reports real provider status', async () => {
    const admin = await signIn(ctx.app);
    const ok = await admin.get('/api/v1/admin/provider').expect(200);
    expect(ok.body).toMatchObject({ configured: true, reachable: true, modelAvailable: true });

    ctx.llm.models = ['something/else'];
    const missing = await admin.get('/api/v1/admin/provider').expect(200);
    expect(missing.body.modelAvailable).toBe(false);

    ctx.llm.configured = false;
    const off = await admin.get('/api/v1/admin/provider').expect(200);
    expect(off.body).toMatchObject({ configured: false, reachable: false });
  });
});

describe('platform', () => {
  it('serves health, the widget, and JSON 404s for unknown API routes', async () => {
    await request(ctx.app).get('/health').expect(200);
    const widget = await request(ctx.app).get('/widget.js').expect(200);
    expect(widget.headers['cross-origin-resource-policy']).toBe('cross-origin');
    const missing = await request(ctx.app).get('/api/v1/nope').expect(404);
    expect(missing.body.error.code).toBe('route_not_found');
  });

  it('exposes only enabled entries through the public catalog, and no secrets in config', async () => {
    const admin = await signIn(ctx.app);
    await admin.patch('/api/v1/admin/knowledge/nimbus-grove-home').send({ enabled: false }).expect(200);
    const catalog = await request(ctx.app).get('/api/v1/public/catalog').expect(200);
    expect(catalog.body.products.map((p: { id: string }) => p.id)).not.toContain('nimbus-grove-home');
    expect(catalog.body.products).toHaveLength(5);

    const config = await request(ctx.app).get('/api/v1/public/config').expect(200);
    expect(JSON.stringify(config.body)).not.toMatch(/gsk_|apiKey/);
  });

  it('allows the widget from other origins on public routes only', async () => {
    const pub = await request(ctx.app).get('/api/v1/public/config').set('Origin', 'https://shop.example');
    expect(pub.headers['access-control-allow-origin']).toBe('*');
    const auth = await request(ctx.app).get('/api/v1/auth/me').set('Origin', 'https://shop.example');
    expect(auth.headers['access-control-allow-origin']).toBeUndefined();
  });
});
