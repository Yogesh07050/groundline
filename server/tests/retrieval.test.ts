// Ports the original retriever tests, plus coverage for what was added: stemming
// and using the previous turn to resolve follow-up questions.
import { describe, expect, it } from 'vitest';
import { seedEntries } from '../src/db/seedData.js';
import type { KnowledgeEntry } from '../src/modules/knowledge/schemas.js';
import { stem, tokenize } from '../src/modules/retrieval/tokenizer.js';
import { createRetrievalService } from '../src/modules/retrieval/service.js';
import { buildContext } from '../src/modules/chat/prompt.js';
import { seedSettings } from '../src/db/seedData.js';

const entries = seedEntries.map((e) => ({ ...e, createdAt: '', updatedAt: '' })) as KnowledgeEntry[];
const retrieval = createRetrievalService(() => entries, 6);
const ids = (q: string) => retrieval.search(q).map((h) => h.id);
const settings = seedSettings({ temperature: 0.3, maxTokens: 700 });

describe('search', () => {
  it('recommends the right product for a travel query', () => {
    expect(ids('best noise cancelling headphones for travel and flights')).toContain('nimbus-halo-anc');
  });

  it('surfaces workout earbuds for gym queries', () => {
    const hits = ids('earbuds for running and the gym that resist sweat');
    expect(hits.includes('nimbus-breeze-buds') || hits.includes('nimbus-sprint-buds')).toBe(true);
  });

  it('retrieves both products named in a comparison', () => {
    const hits = ids('compare the Halo ANC and the Studio Pro headphones');
    expect(hits).toContain('nimbus-halo-anc');
    expect(hits).toContain('nimbus-studio-pro');
  });

  it('finds the returns policy for return questions', () => {
    expect(ids('how do I return something and get a refund')).toContain('policy-returns');
  });

  it('finds the shipping policy for shipping questions', () => {
    expect(ids('do you ship internationally and how long does delivery take')).toContain('policy-shipping');
  });

  it('matches across word forms', () => {
    expect(ids('returned items')).toContain('policy-returns');
    expect(ids('earbud')).toContain('nimbus-breeze-buds');
  });

  it('returns nothing for empty or filler-only queries', () => {
    expect(retrieval.search('')).toEqual([]);
    expect(retrieval.search('   ')).toEqual([]);
    expect(retrieval.search('hi there, thanks!')).toEqual([]);
  });

  it('returns nothing when no term matches', () => {
    expect(retrieval.search('zzzz qqqq')).toEqual([]);
  });

  it('only sees entries the loader provides, so disabled entries stay out', () => {
    const onlyFaqs = createRetrievalService(() => entries.filter((e) => e.type === 'faq'), 6);
    expect(onlyFaqs.search('Nimbus Pebble speaker price').map((h) => h.id)).not.toContain('nimbus-pebble-speaker');
  });
});

describe('searchForTurn', () => {
  it('resolves a follow-up using the previous exchange', () => {
    const history = [
      { role: 'user' as const, content: 'I want earbuds for the gym.' },
      { role: 'assistant' as const, content: 'The Nimbus Breeze Buds are a great fit for workouts.' },
    ];
    const hits = retrieval.searchForTurn('are those waterproof enough?', history).map((h) => h.id);
    expect(hits).toContain('nimbus-breeze-buds');
  });

  it('lets the current message outrank earlier context', () => {
    const history = [
      { role: 'user' as const, content: 'Tell me about the Nimbus Grove speaker' },
      { role: 'assistant' as const, content: 'The Nimbus Grove is a home speaker.' },
    ];
    expect(retrieval.searchForTurn('what is your return policy and refund window?', history)[0]?.type).toBe('policy');
  });
});

describe('tokenizer', () => {
  it('stems plurals and verb forms to a shared root', () => {
    expect(stem('returns')).toBe(stem('returned'));
    expect(stem('shipping')).toBe(stem('ships'));
    expect(stem('batteries')).toBe(stem('battery'));
    expect(stem('headphones')).toBe(stem('headphone'));
  });

  it('leaves model numbers alone', () => {
    expect(tokenize('IPX5 and IP67')).toEqual(['ipx5', 'ip67']);
  });
});

describe('buildContext', () => {
  it('always includes brand identity and the support contact', () => {
    const context = buildContext(settings, []);
    expect(context).toContain('Nimbus Audio');
    expect(context).toContain('support@nimbusaudio.com');
    expect(context).toContain('No specific knowledge-base entries matched');
  });

  it('injects retrieved facts for a real query', () => {
    const context = buildContext(settings, retrieval.search('what is the price of the Nimbus Pebble speaker'));
    expect(context).toContain('$119');
  });
});

describe('result quality', () => {
  it('bridges common vocabulary differences', () => {
    expect(ids('how much does the Pebble cost')[0]).toBe('nimbus-pebble-speaker');
    expect(ids('delivery times')).toContain('policy-shipping');
  });

  it('drops hits far weaker than the best match', () => {
    const hits = retrieval.search('Do you offer student discounts?');
    expect(hits[0]?.id).toBe('faq-3');
    for (const hit of hits) expect(hit.score).toBeGreaterThanOrEqual(hits[0]!.score * 0.2);
  });
});
