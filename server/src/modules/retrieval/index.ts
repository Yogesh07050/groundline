// BM25 index over knowledge documents. The knowledge base is small enough that an
// in-memory keyword index is accurate, instant, and needs no embedding calls or
// vector database. Swap this module to change retrieval; the pipeline won't notice.
import type { SearchDocument } from './documents.js';
import { tokenize } from './tokenizer.js';

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3;
// Hits far below the best one are usually a stray shared word. Dropping them keeps
// irrelevant facts away from the model and out of the usage report.
const MIN_RELATIVE_SCORE = 0.2;
// Words customers use that the knowledge base tends to phrase differently.
const QUERY_SYNONYMS: Record<string, string> = { cost: 'price', delivery: 'ship', deliver: 'ship' };

interface IndexedDocument {
  doc: SearchDocument;
  termFrequency: Map<string, number>;
  length: number;
}

export interface SearchIndex {
  documents: IndexedDocument[];
  idf: Map<string, number>;
  averageLength: number;
}

export interface WeightedQuery {
  text: string;
  weight: number;
}

export interface SearchHit extends SearchDocument {
  score: number;
}

export function buildIndex(docs: SearchDocument[]): SearchIndex {
  const documentFrequency = new Map<string, number>();
  const documents = docs.map((doc) => {
    const titleTokens = tokenize(doc.title);
    const tokens = tokenize(doc.text);
    const termFrequency = new Map<string, number>();
    for (const token of tokens) termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    for (const token of titleTokens) termFrequency.set(token, (termFrequency.get(token) ?? 0) + TITLE_WEIGHT);
    for (const term of termFrequency.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    return { doc, termFrequency, length: tokens.length + titleTokens.length * TITLE_WEIGHT };
  });

  const total = documents.length;
  const idf = new Map<string, number>();
  for (const [term, count] of documentFrequency) {
    idf.set(term, Math.log(1 + (total - count + 0.5) / (count + 0.5)));
  }
  const averageLength = total ? documents.reduce((sum, d) => sum + d.length, 0) / total : 0;
  return { documents, idf, averageLength };
}

/** Rank documents against one or more weighted query strings. */
export function search(index: SearchIndex, queries: WeightedQuery[], limit: number): SearchHit[] {
  const terms = new Map<string, number>();
  for (const { text, weight } of queries) {
    for (const term of tokenize(text)) {
      terms.set(term, Math.max(terms.get(term) ?? 0, weight));
      const synonym = QUERY_SYNONYMS[term];
      if (synonym) {
        for (const expanded of tokenize(synonym)) terms.set(expanded, Math.max(terms.get(expanded) ?? 0, weight));
      }
    }
  }
  if (terms.size === 0) return [];

  const scored: SearchHit[] = [];
  for (const { doc, termFrequency, length } of index.documents) {
    let score = 0;
    for (const [term, weight] of terms) {
      const tf = termFrequency.get(term);
      if (!tf) continue;
      const norm = tf + K1 * (1 - B + (B * length) / (index.averageLength || 1));
      score += weight * (index.idf.get(term) ?? 0) * ((tf * (K1 + 1)) / norm);
    }
    if (score > 0) scored.push({ ...doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const floor = (scored[0]?.score ?? 0) * MIN_RELATIVE_SCORE;
  return scored.filter((hit) => hit.score >= floor).slice(0, limit);
}
