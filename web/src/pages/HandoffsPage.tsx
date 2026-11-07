import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/ConsoleLayout';
import { Button, EmptyState, ErrorState, Pagination, SkeletonRows, useToast } from '../components/ui';
import { api, qs } from '../lib/api';
import { relativeTime } from '../lib/format';
import type { Handoff, Page } from '../lib/types';

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: '', label: 'All' },
];

export function HandoffsPage() {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const toast = useToast();
  const selected = params.get('status') ?? 'open';
  const status = selected === 'all' ? '' : selected;
  const page = Number(params.get('page')) || 1;

  const query = useQuery({
    queryKey: ['handoffs', status, page],
    queryFn: () => api.get<Page<Handoff> & { openCount: number }>(`/admin/handoffs${qs({ status, page })}`),
    placeholderData: keepPreviousData,
  });

  const update = useMutation({
    mutationFn: (input: { id: string; status: 'open' | 'closed' }) => api.patch(`/admin/handoffs/${input.id}`, { status: input.status }),
    onSuccess: (_data, input) => {
      client.invalidateQueries({ queryKey: ['handoffs'] });
      client.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(input.status === 'closed' ? 'Handoff closed and conversation resolved' : 'Handoff reopened');
    },
    onError: (err) => toast.error(err),
  });

  return (
    <div className="page">
      <PageHeader
        title="Handoffs"
        description="Customers who asked to talk to a person. Reply by email, then close the request."
      />

      <div className="tabs" role="tablist" aria-label="Handoff status">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            role="tab"
            className="tab"
            aria-selected={status === tab.value}
            onClick={() => setParams(tab.value === 'open' ? {} : { status: tab.value || 'all' }, { replace: true })}
          >
            {tab.label}
            {tab.value === 'open' && query.data ? <span className="count">{query.data.openCount}</span> : null}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div className="panel"><SkeletonRows /></div>
      ) : query.isError ? (
        <div className="panel"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
      ) : query.data.items.length === 0 ? (
        <div className="panel">
          <EmptyState title={status === 'open' ? 'No open requests' : 'Nothing here yet'}>
            When a customer chooses "Talk to a person" in the widget, their request shows up here.
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="handoffs">
            {query.data.items.map((handoff) => (
              <li key={handoff.id} className="panel handoff">
                <div className="handoff-main">
                  <div className="handoff-who">
                    <strong>{handoff.name}</strong>
                    <a href={`mailto:${handoff.email}`} className="inline-icon"><Mail aria-hidden /> {handoff.email}</a>
                  </div>
                  {handoff.note ? <p>{handoff.note}</p> : <p className="muted">No note added.</p>}
                  <p className="muted handoff-context">
                    <Link to={`/app/conversations/${handoff.conversationId}`}>{handoff.conversationTitle ?? 'View conversation'}</Link>
                    {' · '}{relativeTime(handoff.createdAt)}
                  </p>
                </div>
                <div className="handoff-actions">
                  {handoff.status === 'open' ? (
                    <Button
                      loading={update.isPending && update.variables?.id === handoff.id}
                      onClick={() => update.mutate({ id: handoff.id, status: 'closed' })}
                    >
                      Close
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      loading={update.isPending && update.variables?.id === handoff.id}
                      onClick={() => update.mutate({ id: handoff.id, status: 'open' })}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            onPage={(p) => setParams({ ...(status === 'open' ? {} : { status: status || 'all' }), page: String(p) })}
          />
        </>
      )}
    </div>
  );
}
