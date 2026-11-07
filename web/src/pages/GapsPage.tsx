import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { OutcomeBadge } from '../components/badges';
import { PageHeader } from '../components/ConsoleLayout';
import { Button, buttonClass, EmptyState, ErrorState, SkeletonRows, useToast } from '../components/ui';
import { api, qs } from '../lib/api';
import { relativeTime } from '../lib/format';
import type { KnowledgeGap } from '../lib/types';

export function GapsPage() {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const toast = useToast();
  const days = Number(params.get('days')) || 30;

  const query = useQuery({
    queryKey: ['gaps', days],
    queryFn: () => api.get<{ items: KnowledgeGap[] }>(`/admin/analytics/gaps${qs({ days })}`),
    placeholderData: keepPreviousData,
  });

  const dismiss = useMutation({
    mutationFn: (gap: KnowledgeGap) => api.post('/admin/analytics/gaps/dismiss', { query: gap.query }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['gaps'] });
      client.invalidateQueries({ queryKey: ['overview'] });
      toast.success('Question dismissed');
    },
    onError: (err) => toast.error(err),
  });

  return (
    <div className="page">
      <PageHeader
        title="Knowledge gaps"
        description="Questions the assistant couldn't answer from your knowledge base, most frequent first. Answer them once and it can handle them from then on."
        actions={
          <select className="select select-compact" aria-label="Date range" value={days} onChange={(e) => setParams({ days: e.target.value }, { replace: true })}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        }
      />
      {query.isPending ? (
        <div className="panel"><SkeletonRows /></div>
      ) : query.isError ? (
        <div className="panel"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
      ) : query.data.items.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<CheckCircle2 aria-hidden />} title="No open gaps">
            Every question in this period was answered from the knowledge base, or has been dismissed.
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table stack">
            <thead>
              <tr><th>Question</th><th>What happened</th><th className="num">Asked</th><th>Last asked</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {query.data.items.map((gap) => (
                <tr key={gap.normalized}>
                  <td style={{ maxWidth: 420 }}>
                    <Link className="cell-primary" to={`/app/conversations/${gap.conversationId}`}>{gap.query}</Link>
                  </td>
                  <td><OutcomeBadge outcome={gap.outcome} /></td>
                  <td className="num hide-sm">{gap.count}</td>
                  <td className="muted hide-sm" style={{ whiteSpace: 'nowrap' }}>{relativeTime(gap.lastAskedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <Link className={buttonClass()} to={`/app/knowledge?new=faq${qs({ title: gap.query, gap: gap.query }).replace('?', '&')}`}>
                        <Plus /> Add answer
                      </Link>
                      <Button variant="ghost" loading={dismiss.isPending && dismiss.variables?.normalized === gap.normalized} onClick={() => dismiss.mutate(gap)}>Dismiss</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
