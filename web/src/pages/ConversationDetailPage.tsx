import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { OutcomeBadge, StatusBadge } from '../components/badges';
import { PageHeader } from '../components/ConsoleLayout';
import { Markdown } from '../components/Markdown';
import { Button, ConfirmDialog, ErrorState, SkeletonRows, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { channelLabels, dateTime, duration, typeLabels } from '../lib/format';
import type { ConversationDetail, ConversationStatus, Message } from '../lib/types';

export function SourceList({ message }: { message: Message }) {
  if (message.sources.length === 0) return <p className="muted">No knowledge entries were retrieved for this reply.</p>;
  const top = message.sources[0]?.score || 1;
  return (
    <ul className="sources">
      {message.sources.map((source) => (
        <li key={source.id}>
          <div className="source-line">
            <Link to={`/app/knowledge?edit=${encodeURIComponent(source.id)}`} className="truncate">{source.title}</Link>
            <span className="muted">{typeLabels[source.type]}</span>
            <span className="muted tnum source-score">{source.score.toFixed(2)}</span>
          </div>
          <div className="ranked-track" aria-hidden><div style={{ width: `${(source.score / top) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function ReplyMeta({ message }: { message: Message }) {
  return (
    <div className="reply-meta">
      <OutcomeBadge outcome={message.outcome} />
      <span className="tnum">{duration(message.latencyMs)}</span>
      {message.completionTokens !== null ? <span className="tnum">{(message.promptTokens ?? 0) + message.completionTokens} tokens</span> : null}
      {message.feedback === 1 ? <span className="badge badge-good"><ThumbsUp aria-hidden />Helpful</span> : null}
      {message.feedback === -1 ? <span className="badge badge-danger"><ThumbsDown aria-hidden />Not helpful</span> : null}
    </div>
  );
}

export function ConversationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const query = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<ConversationDetail>(`/admin/conversations/${id}`),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ['conversation', id] });
    client.invalidateQueries({ queryKey: ['conversations'] });
    client.invalidateQueries({ queryKey: ['handoffs'] });
  };

  const setStatus = useMutation({
    mutationFn: (status: ConversationStatus) => api.patch(`/admin/conversations/${id}`, { status }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/conversations/${id}`),
    onSuccess: () => {
      client.removeQueries({ queryKey: ['conversation', id] });
      client.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation deleted');
      navigate('/app/conversations', { replace: true });
    },
    onError: (err) => {
      setConfirming(false);
      toast.error(err);
    },
  });

  const back = (
    <Link to="/app/conversations" className="back-link"><ArrowLeft aria-hidden /> Conversations</Link>
  );

  if (query.isPending) return <div className="page"><div className="panel"><SkeletonRows /></div></div>;
  if (query.isError) {
    return (
      <div className="page">
        {back}
        <div className="panel"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
      </div>
    );
  }

  const { conversation, messages, handoffs } = query.data;
  const resolved = conversation.status === 'resolved';

  return (
    <div className="page">
      <PageHeader
        back={back}
        title={conversation.title ?? 'Empty conversation'}
        actions={
          <>
            <Button loading={setStatus.isPending} onClick={() => setStatus.mutate(resolved ? 'open' : 'resolved')}>
              {resolved ? 'Reopen' : 'Mark resolved'}
            </Button>
            <Button variant="danger" onClick={() => setConfirming(true)}><Trash2 /> Delete</Button>
          </>
        }
      />

      <div className="detail">
        <section className="panel transcript" aria-label="Transcript">
          {messages.length === 0 ? <p className="muted">No messages in this conversation.</p> : null}
          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="turn turn-user">
                <div className="turn-head"><strong>Customer</strong><span className="muted">{dateTime(message.createdAt)}</span></div>
                <p className="turn-text">{message.content}</p>
              </div>
            ) : (
              <div key={message.id} className="turn turn-bot">
                <div className="turn-head"><strong>Assistant</strong><span className="muted">{dateTime(message.createdAt)}</span></div>
                <Markdown text={message.content} />
                <ReplyMeta message={message} />
                <details className="turn-sources">
                  <summary>Sources ({message.sources.length})</summary>
                  <SourceList message={message} />
                  {message.model ? <p className="muted source-model">Model: <span className="mono">{message.model}</span></p> : null}
                </details>
              </div>
            ),
          )}
        </section>

        <aside className="detail-side">
          <section className="panel panel-pad">
            <h2 className="panel-title">Details</h2>
            <dl className="facts">
              <dt>Status</dt><dd><StatusBadge status={conversation.status} /></dd>
              <dt>Channel</dt><dd>{channelLabels[conversation.channel]}</dd>
              <dt>Started</dt><dd>{dateTime(conversation.createdAt)}</dd>
              <dt>Last activity</dt><dd>{dateTime(conversation.lastMessageAt)}</dd>
              <dt>Messages</dt><dd className="tnum">{conversation.messageCount}</dd>
            </dl>
          </section>
          {handoffs.length ? (
            <section className="panel panel-pad">
              <h2 className="panel-title">Handoff request</h2>
              {handoffs.map((handoff) => (
                <div key={handoff.id} className="stack-sm handoff-card">
                  <strong>{handoff.name}</strong>
                  <a href={`mailto:${handoff.email}`} className="inline-icon"><Mail aria-hidden /> {handoff.email}</a>
                  {handoff.note ? <p>{handoff.note}</p> : null}
                  <span className="muted">{handoff.status === 'open' ? 'Open' : 'Closed'} · {dateTime(handoff.createdAt)}</span>
                </div>
              ))}
              <Link to="/app/handoffs" className="panel-link">Manage handoffs</Link>
            </section>
          ) : null}
        </aside>
      </div>

      {confirming ? (
        <ConfirmDialog
          danger
          title="Delete this conversation?"
          body="The transcript and any handoff request will be permanently removed, and it will no longer count in reports."
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
