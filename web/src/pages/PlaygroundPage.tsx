// Runs the real chat pipeline against the real model, and shows operators what
// customers don't see: which entries were retrieved, how the reply was classified,
// and how long it took. Conversations here are stored under the Playground channel.
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw, Search, Send } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/ConsoleLayout';
import { Markdown } from '../components/Markdown';
import { Button } from '../components/ui';
import { api, ApiError, qs } from '../lib/api';
import { typeLabels } from '../lib/format';
import { streamReply } from '../lib/stream';
import type { Message, ProviderStatus, RetrievalResult } from '../lib/types';
import { ReplyMeta, SourceList } from './ConversationDetailPage';

type Turn =
  | { kind: 'user'; id: string; content: string }
  | { kind: 'assistant'; message: Message }
  | { kind: 'streaming'; content: string };

export function PlaygroundPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; retryPath: string | null; resend: string | null } | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  const provider = useQuery({ queryKey: ['provider'], queryFn: () => api.get<ProviderStatus>('/admin/provider'), staleTime: 60_000 });

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns, failure]);

  const run = async (path: string, body: unknown, resend: string | null) => {
    setBusy(true);
    setFailure(null);
    abort.current = new AbortController();
    let content = '';
    setTurns((all) => [...all, { kind: 'streaming', content: '' }]);
    const replaceStreaming = (next: Turn | null) =>
      setTurns((all) => {
        const rest = all.filter((t) => t.kind !== 'streaming');
        return next ? [...rest, next] : rest;
      });
    try {
      await streamReply(
        path,
        body,
        {
          onDelta: (text) => {
            content += text;
            replaceStreaming({ kind: 'streaming', content });
          },
          onDone: (message) => {
            replaceStreaming({ kind: 'assistant', message });
            setSelected(message);
          },
        },
        abort.current.signal,
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      replaceStreaming(null);
      const error = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Something went wrong.');
      // 4xx before the stream opens means nothing was stored, so resend. Afterward, retry.
      const stored = error.status === 0 || error.status === 502;
      setFailure({
        message: error.message,
        retryPath: stored && conversationId ? `/admin/playground/conversations/${conversationId}/retry` : null,
        resend: stored ? null : resend,
      });
    } finally {
      setBusy(false);
    }
  };

  const send = async (text: string) => {
    let id = conversationId;
    setFailure(null);
    if (!id) {
      try {
        ({ id } = await api.post<{ id: string }>('/admin/playground/conversations'));
        setConversationId(id);
      } catch (err) {
        setFailure({ message: (err as Error).message, retryPath: null, resend: text });
        return;
      }
    }
    setTurns((all) => [...all, { kind: 'user', id: crypto.randomUUID(), content: text }]);
    await run(`/admin/playground/conversations/${id}/messages`, { content: text }, text);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void send(text);
  };

  const restart = () => {
    abort.current?.abort();
    setConversationId(null);
    setTurns([]);
    setSelected(null);
    setFailure(null);
    setBusy(false);
  };

  const notReady = provider.data && (!provider.data.configured || !provider.data.reachable || !provider.data.modelAvailable);

  return (
    <div className="page page-fill">
      <PageHeader
        title="Playground"
        description="Test the assistant against the live knowledge base and model. Stored under the Playground channel."
        actions={<Button onClick={restart} disabled={turns.length === 0}><RotateCcw /> New conversation</Button>}
      />
      {notReady ? (
        <div className="banner" role="alert">
          <AlertTriangle aria-hidden />
          <span>
            {!provider.data.configured
              ? 'No Groq API key is configured, so the assistant cannot reply. Add GROQ_API_KEY to .env and restart the server.'
              : !provider.data.reachable
                ? provider.data.error
                : `The model "${provider.data.model}" isn't available to this API key.`}{' '}
            <Link to="/app/settings#provider">Open settings</Link>
          </span>
        </div>
      ) : null}

      <div className="playground">
        <section className="panel chat" aria-label="Test conversation">
          <div className="chat-log" ref={log} role="log" aria-live="polite">
            {turns.length === 0 ? (
              <div className="chat-empty">
                <p className="muted">Ask anything a customer might ask. Try a question your knowledge base doesn't cover, too.</p>
              </div>
            ) : null}
            {turns.map((turn, i) => {
              if (turn.kind === 'user') return <div key={turn.id} className="bubble bubble-user">{turn.content}</div>;
              if (turn.kind === 'streaming') {
                return (
                  <div key="streaming" className="bubble bubble-bot">
                    {turn.content ? <Markdown text={turn.content} /> : <span className="typing" aria-label="Assistant is typing"><i /><i /><i /></span>}
                  </div>
                );
              }
              const isSelected = selected?.id === turn.message.id;
              return (
                <button
                  key={turn.message.id ?? i}
                  type="button"
                  className={`bubble bubble-bot bubble-selectable${isSelected ? ' selected' : ''}`}
                  aria-pressed={isSelected}
                  aria-label="Inspect this reply"
                  onClick={() => setSelected(turn.message)}
                >
                  <Markdown text={turn.message.content} />
                </button>
              );
            })}
            {failure ? (
              <div className="banner banner-danger" role="alert">
                <AlertTriangle aria-hidden />
                <span>
                  {failure.message}{' '}
                  {failure.retryPath ? (
                    <button type="button" className="linklike" onClick={() => void run(failure.retryPath!, {}, null)}>Try again</button>
                  ) : failure.resend ? (
                    <button
                      type="button"
                      className="linklike"
                      onClick={() => {
                        const text = failure.resend!;
                        setTurns((all) => (all.at(-1)?.kind === 'user' ? all.slice(0, -1) : all));
                        void send(text);
                      }}
                    >
                      Try again
                    </button>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
          <form className="chat-compose" onSubmit={onSubmit}>
            <textarea
              className="textarea"
              rows={1}
              aria-label="Message"
              placeholder="Ask a question…"
              maxLength={1000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) onSubmit(e);
              }}
            />
            <Button type="submit" variant="primary" size="icon" aria-label="Send" disabled={busy || !draft.trim()}><Send /></Button>
          </form>
        </section>

        <aside className="inspector">
          <section className="panel panel-pad">
            <h2 className="panel-title">Reply details</h2>
            {selected ? (
              <div className="stack-md">
                <ReplyMeta message={selected} />
                <div>
                  <h3 className="mini-title">Retrieved knowledge</h3>
                  <SourceList message={selected} />
                </div>
                {selected.model ? <p className="muted field-hint">Model: <span className="mono">{selected.model}</span></p> : null}
              </div>
            ) : (
              <p className="muted">Send a message to see which knowledge entries grounded the reply.</p>
            )}
          </section>
          <RetrievalTest />
        </aside>
      </div>
    </div>
  );
}

/** Check what retrieval finds for a question, without calling the model. */
function RetrievalTest() {
  const [q, setQ] = useState('');
  const search = useMutation({
    mutationFn: (query: string) => api.get<{ results: RetrievalResult[] }>(`/admin/knowledge/retrieval-test${qs({ q: query })}`),
  });
  return (
    <section className="panel panel-pad">
      <h2 className="panel-title">Test retrieval</h2>
      <p className="panel-sub">See what a question matches, without calling the model.</p>
      <form
        className="retrieval-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) search.mutate(q.trim());
        }}
      >
        <input className="input" aria-label="Question to test" placeholder="waterproof speaker" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" size="icon" aria-label="Test" loading={search.isPending}>{search.isPending ? null : <Search />}</Button>
      </form>
      {search.isError ? <p className="field-error">{search.error.message}</p> : null}
      {search.data ? (
        search.data.results.length ? (
          <ol className="retrieval-results">
            {search.data.results.map((r) => (
              <li key={r.id}>
                <span className="truncate">{r.title}</span>
                <span className="muted">{typeLabels[r.type]}</span>
                <span className="muted tnum">{r.score.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted retrieval-none">No matches. The assistant would refer this question to your team.</p>
        )
      ) : null}
    </section>
  );
}
