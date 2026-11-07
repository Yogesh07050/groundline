// Shapes returned by the API. The server is the source of truth for validation;
// these types describe what the UI reads.

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type KnowledgeType = 'product' | 'policy' | 'faq';

export interface ProductData {
  category: string;
  price: number;
  availability: string;
  colors: string[];
  shortDescription: string;
  highlights: string[];
  specs: Record<string, string>;
  bestFor: string;
  warranty: string;
}
export interface PolicyData {
  summary: string;
  details: string[];
}
export interface FaqData {
  answer: string;
}

interface EntryBase {
  id: string;
  title: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export type KnowledgeEntry =
  | (EntryBase & { type: 'product'; data: ProductData })
  | (EntryBase & { type: 'policy'; data: PolicyData })
  | (EntryBase & { type: 'faq'; data: FaqData });

export interface KnowledgeList extends Page<KnowledgeEntry> {
  counts: Array<{ type: KnowledgeType; total: number; enabled: number }>;
}

export interface RetrievalResult {
  id: string;
  type: KnowledgeType;
  title: string;
  text: string;
  score: number;
}

export interface ImportPlan {
  filename: string;
  format: 'csv' | 'json';
  rows: Array<{ row: number; type: KnowledgeType; title: string; action: 'create' | 'update' | 'unchanged' }>;
  errors: Array<{ row: number; title: string | null; messages: string[] }>;
  summary: { create: number; update: number; unchanged: number; failed: number };
}

export interface ImportRecord {
  id: string;
  filename: string;
  format: string;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  importedBy: string;
  createdAt: string;
}

export type Outcome = 'answered' | 'referred' | 'no_match' | 'smalltalk';
export type Channel = 'widget' | 'playground' | 'scenario';
export type ConversationStatus = 'open' | 'escalated' | 'resolved';

export interface Conversation {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  title: string | null;
  messageCount: number;
  createdAt: string;
  lastMessageAt: string;
  lastOutcome: Outcome | null;
  negativeFeedback: number;
}

export interface SourceRef {
  id: string;
  type: KnowledgeType;
  title: string;
  score: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  outcome: Outcome | null;
  sources: SourceRef[];
  model: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  feedback: -1 | 1 | null;
}

export interface Handoff {
  id: string;
  conversationId: string;
  conversationTitle: string | null;
  name: string;
  email: string;
  note: string | null;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  handoffs: Handoff[];
}

export interface KnowledgeGap {
  query: string;
  normalized: string;
  count: number;
  lastAskedAt: string;
  outcome: 'referred' | 'no_match';
  conversationId: string;
}

export interface Overview {
  range: { days: number; since: string; channel: Channel | null };
  totals: {
    conversations: number;
    customerMessages: number;
    replies: number;
    answered: number;
    referred: number;
    noMatch: number;
    smalltalk: number;
    answerRate: number | null;
    helpful: number;
    notHelpful: number;
    medianLatencyMs: number | null;
    p95LatencyMs: number | null;
    promptTokens: number;
    completionTokens: number;
  };
  daily: Array<{ date: string; conversations: number; messages: number }>;
  topSources: Array<{ id: string; title: string; type: KnowledgeType; uses: number }>;
  gaps: KnowledgeGap[];
  openHandoffs: number;
}

export interface Settings {
  assistant: {
    name: string;
    welcomeMessage: string;
    suggestions: string[];
    model: string | null;
    temperature: number;
    maxTokens: number;
  };
  brand: {
    name: string;
    tagline: string;
    about: string;
    uniqueSellingPoints: string[];
    supportEmail: string;
    supportPhone: string;
    supportHours: string;
    handoffNote: string;
    website: string;
    currency: string;
  };
  widget: { accentColor: string };
}

export interface ProviderStatus {
  configured: boolean;
  reachable: boolean;
  model: string;
  modelAvailable: boolean;
  models: string[];
  error: string | null;
}

export interface Catalog {
  brand: {
    name: string;
    tagline: string;
    about: string;
    uniqueSellingPoints: string[];
    supportEmail: string;
    supportPhone: string;
    supportHours: string;
    currency: string;
  };
  products: Array<ProductData & { id: string; name: string }>;
  policies: Array<{ id: string; title: string; summary: string }>;
}
