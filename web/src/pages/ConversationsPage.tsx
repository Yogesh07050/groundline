import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Search, ThumbsDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { OutcomeBadge, StatusBadge } from '../components/badges';
import { PageHeader } from '../components/ConsoleLayout';
import { buttonClass, Button, EmptyState, ErrorState, Pagination, SkeletonRows, useDebounced } from '../components/ui';
import { api, apiUrl, qs } from '../lib/api';
import { channelLabels, outcomeLabels, relativeTime, statusLabels } from '../lib/format';
import type { Conversation, Page } from '../lib/types';

const FILTERS = ['q', 'status', 'channel', 'outcome', 'days'] as const;

export function ConversationsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search);

  const setFilter = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) setFilter('q', debounced);
    // Only reacts to the debounced text; setFilter is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const page = Number(params.get('page')) || 1;
  const sort = params.get('sort') ?? 'recent';
  const filters = Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? '']));
  const hasFilters = FILTERS.some((key) => params.get(key));

  const query = useQuery({
    queryKey: ['conversations', filters, sort, page],
    queryFn: () => api.get<Page<Conversation>>(`/admin/conversations${qs({ ...filters, sort, page })}`),
    placeholderData: keepPreviousData,
  });

  const select = (key: string, label: string, options: Record<string, string>, all: string) => (
    <select className="select select-compact" aria-label={label} value={params.get(key) ?? ''} onChange={(e) => setFilter(key, e.target.value)}>
      <option value="">{all}</option>
      {Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  );

  return (
    <div className="page">
      <PageHeader
        title="Conversations"
        description="Every conversation the assistant has had, with the sources behind each reply."
        actions={
          <a className={buttonClass()} href={apiUrl(`/admin/conversations/export.csv${qs(filters)}`)} download>
            <Download /> Export CSV
          </a>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input className="input" type="search" placeholder="Search messages" aria-label="Search messages" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {select('status', 'Status', statusLabels, 'Any status')}
        {select('outcome', 'Outcome', outcomeLabels, 'Any outcome')}
        {select('channel', 'Channel', channelLabels, 'All channels')}
        {select('days', 'Date range', { '1': 'Last 24 hours', '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days' }, 'All time')}
        <select className="select select-compact" aria-label="Sort" value={sort} onChange={(e) => setFilter('sort', e.target.value === 'recent' ? '' : e.target.value)}>
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest first</option>
          <option value="longest">Longest</option>
        </select>
      </div>

      {query.isPending ? (
        <div className="panel"><SkeletonRows /></div>
      ) : query.isError ? (
        <div className="panel"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
      ) : query.data.items.length === 0 ? (
        <div className="panel">
          {hasFilters ? (
            <EmptyState
              title="No conversations match these filters"
              actions={<Button onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState title="No conversations yet" actions={<Link to="/app/playground" className={buttonClass('primary')}>Open the playground</Link>}>
              Conversations appear here as soon as someone talks to the assistant.
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
            <table className="table stack">
              <thead>
                <tr>
                  <th>First message</th>
                  <th>Status</th>
                  <th>Last reply</th>
                  <th>Channel</th>
                  <th className="num">Messages</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((c) => (
                  <tr key={c.id} className="row-link" onClick={() => navigate(`/app/conversations/${c.id}`)}>
                    <td style={{ maxWidth: 360 }}>
                      <Link to={`/app/conversations/${c.id}`} className="cell-primary truncate" onClick={(e) => e.stopPropagation()}>
                        {c.title ?? 'Empty conversation'}
                      </Link>
                      {c.negativeFeedback > 0 ? (
                        <span className="cell-sub flag"><ThumbsDown aria-hidden /> {c.negativeFeedback} rated not helpful</span>
                      ) : null}
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td><OutcomeBadge outcome={c.lastOutcome} /></td>
                    <td className="hide-sm muted">{channelLabels[c.channel]}</td>
                    <td className="num hide-sm">{c.messageCount}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{relativeTime(c.lastMessageAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={(p) => setFilter('page', String(p))} />
        </>
      )}
    </div>
  );
}
