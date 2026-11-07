import type { KnowledgeEntry } from '../knowledge/schemas.js';
import { toDocument } from './documents.js';
import { buildIndex, search, type SearchHit, type SearchIndex, type WeightedQuery } from './index.js';
import { tokenize } from './tokenizer.js';

export interface PriorTurn {
  role: 'user' | 'assistant';
  content: string;
}

// How much earlier turns count, relative to the current message (1). Without
// them, a follow-up like "are those waterproof?" loses what "those" refers to.
const PRIOR_USER_WEIGHT = 0.5;
const PRIOR_ASSISTANT_WEIGHT = 0.3;

export function createRetrievalService(loadEntries: () => KnowledgeEntry[], defaultLimit: number) {
  let index: SearchIndex | null = null;
  const current = () => (index ??= buildIndex(loadEntries().map(toDocument)));

  return {
    /** Call after any knowledge write; the index rebuilds lazily on next use. */
    invalidate() {
      index = null;
    },

    search(query: string, limit = defaultLimit): SearchHit[] {
      return search(current(), [{ text: query, weight: 1 }], limit);
    },

    /** Retrieve for a chat turn, using the previous exchange as lower-weighted context. */
    searchForTurn(message: string, history: PriorTurn[], limit = defaultLimit): SearchHit[] {
      const queries: WeightedQuery[] = [{ text: message, weight: 1 }];
      const lastUser = history.findLast((t) => t.role === 'user');
      const lastAssistant = history.findLast((t) => t.role === 'assistant');
      if (lastUser) queries.push({ text: lastUser.content, weight: PRIOR_USER_WEIGHT });
      if (lastAssistant) queries.push({ text: lastAssistant.content, weight: PRIOR_ASSISTANT_WEIGHT });
      return search(current(), queries, limit);
    },

    /** Whether this exact message, without history, matches anything in the knowledge base. */
    hasDirectMatch(message: string): boolean {
      return search(current(), [{ text: message, weight: 1 }], 1).length > 0;
    },

    isMeaningful: (message: string) => tokenize(message).length > 0,
  };
}

export type RetrievalService = ReturnType<typeof createRetrievalService>;
