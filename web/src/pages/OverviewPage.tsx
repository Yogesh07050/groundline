import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, FlaskConical, Store } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { ColumnChart, RankedBars, SegmentedBar } from '../components/charts';
import { PageHeader } from '../components/ConsoleLayout';
import { buttonClass, EmptyState, ErrorState, SkeletonRows } from '../components/ui';
import { api, qs } from '../lib/api';
import { channelLabels, duration, number, percent, relativeTime, typeLabels } from '../lib/format';
import type { Overview } from '../lib/types';

function Metric(props: { label: string; value: string; note?: string; to?: string }) {
  const inner = (
    <>
      <span className="metric-label">{props.label}</span>
      <span className="metric-value tnum">{props.value}</span>
      {props.note ? <span className="metric-note">{props.note}</span> : null}
    </>
  );
  return props.to ? <Link to={props.to} className="metric metric-link">{inner}</Link> : <div className="metric">{inner}</div>;
}

export function OverviewPage() {
  const [params, setParams] = useSearchParams();
  const days = Number(params.get('days')) || 30;
  const channel = params.get('channel') ?? '';

  const setFilter = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });

  const query = useQuery({
    queryKey: ['overview', days, channel],
    queryFn: () => api.get<Overview>(`/admin/analytics/overview${qs({ days, channel })}`),
    placeholderData: keepPreviousData,
  });

  const filters = (
    <>
      <select className="select select-compact" aria-label="Channel" value={channel} onChange={(e) => setFilter('channel', e.target.value)}>
        <option value="">All channels</option>
        {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select className="select select-compact" aria-label="Date range" value={days} onChange={(e) => setFilter('days', e.target.value)}>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>
    </>
  );

  return (
    <div className="page">
      <PageHeader title="Overview" description="How the assistant is performing, from stored conversations." actions={filters} />
      {query.isPending ? (
        <div className="panel"><SkeletonRows rows={8} /></div>
      ) : query.isError ? (
        <div className="panel"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
      ) : query.data.totals.customerMessages === 0 ? (
        <div className="panel">
          <EmptyState
            title="No conversations in this period"
            actions={
              <>
                <Link to="/app/playground" className={buttonClass('primary')}><FlaskConical /> Open the playground</Link>
                <Link to="/demo" target="_blank" className={buttonClass()}><Store /> Open the demo storefront</Link>
              </>
            }
          >
            These numbers come from real conversations. Ask the assistant something and this page fills in.
          </EmptyState>
        </div>
      ) : (
        <Report data={query.data} />
      )}
    </div>
  );
}

function Report({ data }: { data: Overview }) {
  const { totals } = data;
  const rated = totals.helpful + totals.notHelpful;

  return (
    <div className="stack-lg">
      <section className="metrics" aria-label="Key numbers">
        <Metric label="Conversations" value={number(totals.conversations)} note={`${number(totals.customerMessages)} customer messages`} to="/app/conversations" />
        <Metric
          label="Answer rate"
          value={percent(totals.answerRate)}
          note={`${number(totals.answered)} of ${number(totals.answered + totals.referred + totals.noMatch)} questions`}
        />
        <Metric label="Median reply time" value={duration(totals.medianLatencyMs)} note={`95th percentile ${duration(totals.p95LatencyMs)}`} />
        <Metric
          label="Rated helpful"
          value={rated ? percent(totals.helpful / rated) : '—'}
          note={rated ? `${number(rated)} rating${rated === 1 ? '' : 's'}` : 'No ratings yet'}
        />
        <Metric label="Open handoffs" value={number(data.openHandoffs)} note="Waiting for your team" to="/app/handoffs?status=open" />
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-title">Conversations per day</h2>
        <ColumnChart unit="Conversations" points={data.daily.map((d) => ({ date: d.date, value: d.conversations }))} />
      </section>

      <div className="grid-2">
        <section className="panel panel-pad">
          <h2 className="panel-title">How questions were handled</h2>
          <p className="panel-sub">Excludes greetings and small talk. Classified automatically from each reply.</p>
          <SegmentedBar
            segments={[
              { label: 'Answered', value: totals.answered, color: 'var(--mark-1)', hint: 'From the knowledge base' },
              { label: 'Referred to team', value: totals.referred, color: 'var(--mark-2)', hint: "Said it didn't know" },
              { label: 'No match', value: totals.noMatch, color: 'var(--mark-3)', hint: 'Nothing relevant found' },
            ]}
          />
        </section>

        <section className="panel panel-pad">
          <h2 className="panel-title">Most-used knowledge</h2>
          <p className="panel-sub">Entries retrieved most often to ground replies.</p>
          {data.topSources.length ? (
            <RankedBars rows={data.topSources.map((s) => ({ id: s.id, label: s.title, sublabel: typeLabels[s.type], value: s.uses }))} />
          ) : (
            <p className="muted">Nothing retrieved in this period.</p>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Questions the assistant couldn't answer</h2>
            <p className="panel-sub">Add these to the knowledge base so it can answer next time.</p>
          </div>
          <Link to="/app/gaps" className={buttonClass('ghost')}>View all <ArrowRight /></Link>
        </div>
        {data.gaps.length ? (
          <ul className="gap-list">
            {data.gaps.map((gap) => (
              <li key={gap.normalized}>
                <Link to={`/app/conversations/${gap.conversationId}`} className="truncate">{gap.query}</Link>
                <span className="muted tnum">{gap.count > 1 ? `${gap.count} times · ` : ''}{relativeTime(gap.lastAskedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted panel-empty">No unanswered questions in this period.</p>
        )}
      </section>
    </div>
  );
}
