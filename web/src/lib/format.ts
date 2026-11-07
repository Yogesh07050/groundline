import type { Channel, ConversationStatus, KnowledgeType, Outcome } from './types';

export const number = (value: number) => value.toLocaleString('en-US');

export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

export function duration(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Parses a YYYY-MM-DD bucket as UTC, matching how the API groups days. */
export const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const outcomeLabels: Record<Outcome, string> = {
  answered: 'Answered',
  referred: 'Referred to team',
  no_match: 'No match',
  smalltalk: 'Small talk',
};

export const statusLabels: Record<ConversationStatus, string> = {
  open: 'Open',
  escalated: 'Escalated',
  resolved: 'Resolved',
};

export const channelLabels: Record<Channel, string> = {
  widget: 'Website widget',
  playground: 'Playground',
  scenario: 'Test scenario',
};

export const typeLabels: Record<KnowledgeType, string> = {
  product: 'Product',
  policy: 'Policy',
  faq: 'FAQ',
};
