import { AlertTriangle, CheckCircle2, CircleDashed, MessageCircle, UserRound } from 'lucide-react';
import { outcomeLabels, statusLabels } from '../lib/format';
import type { ConversationStatus, Outcome } from '../lib/types';

export function StatusBadge({ status }: { status: ConversationStatus }) {
  if (status === 'resolved') {
    return <span className="badge badge-good"><CheckCircle2 aria-hidden />{statusLabels.resolved}</span>;
  }
  if (status === 'escalated') {
    return <span className="badge badge-warn"><UserRound aria-hidden />{statusLabels.escalated}</span>;
  }
  return <span className="badge">{statusLabels.open}</span>;
}

export function OutcomeBadge({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return <span className="muted">—</span>;
  const label = outcomeLabels[outcome];
  switch (outcome) {
    case 'answered':
      return <span className="badge badge-good"><CheckCircle2 aria-hidden />{label}</span>;
    case 'referred':
      return <span className="badge badge-warn"><UserRound aria-hidden />{label}</span>;
    case 'no_match':
      return <span className="badge badge-danger"><AlertTriangle aria-hidden />{label}</span>;
    case 'smalltalk':
      return <span className="badge"><MessageCircle aria-hidden />{label}</span>;
    default:
      return <span className="badge"><CircleDashed aria-hidden />{label}</span>;
  }
}
