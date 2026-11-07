import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Search, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '../components/ConsoleLayout';
import { EntryDrawer, type DrawerTarget } from '../components/EntryDrawer';
import { Button, buttonClass, EmptyState, ErrorState, Pagination, SkeletonRows, useDebounced, useToast } from '../components/ui';
import { api, apiUrl, qs } from '../lib/api';
import { money, relativeTime, typeLabels } from '../lib/format';
import type { KnowledgeEntry, KnowledgeList, KnowledgeType } from '../lib/types';

const TABS: Array<{ value: KnowledgeType | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'product', label: 'Products' },
  { value: 'policy', label: 'Policies' },
  { value: 'faq', label: 'FAQs' },
];

function summary(entry: KnowledgeEntry): string {
  switch (entry.type) {
    case 'product':
      return `${money(entry.data.price, 'USD')} · ${entry.data.category} · ${entry.data.availability}`;
    case 'policy':
      return entry.data.summary;
    case 'faq':
      return entry.data.answer;
  }
}

export function KnowledgePage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Deep links: ?edit=<id> from a source citation; ?new=faq&title=... from the gap report.
  useEffect(() => {
    const edit = params.get('edit');
    const create = params.get('new') as KnowledgeType | null;
    if (edit) {
      setDrawer({ mode: 'edit', id: edit });
    } else if (create) {
      setDrawer({ mode: 'create', type: create, title: params.get('title') ?? '', fromGap: params.get('gap') ?? undefined });
    }
    // Only on arrival; the params are cleared when the drawer closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!addOpen) return;
    const close = (e: MouseEvent) => {
      if (!addRef.current?.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [addOpen]);

  const type = (params.get('type') ?? '') as KnowledgeType | '';
  const enabled = params.get('enabled') ?? '';
  const sort = params.get('sort') ?? 'title';
  const page = Number(params.get('page')) || 1;
  const q = params.get('q') ?? '';

  const query = useQuery({
    queryKey: ['knowledge', { type, enabled, sort, page, q }],
    queryFn: () => api.get<KnowledgeList>(`/admin/knowledge${qs({ type, enabled, sort, page, q })}`),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (entry: KnowledgeEntry) => api.patch(`/admin/knowledge/${entry.id}`, { enabled: !entry.enabled }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['knowledge'] }),
    onError: (err) => toast.error(err),
  });

  const countFor = (value: KnowledgeType | '') => {
    const counts = query.data?.counts ?? [];
    return value ? counts.find((c) => c.type === value)?.total ?? 0 : counts.reduce((sum, c) => sum + c.total, 0);
  };

  const closeDrawer = () => {
    setDrawer(null);
    if (params.has('edit') || params.has('new')) {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        ['edit', 'new', 'title', 'gap'].forEach((key) => next.delete(key));
        return next;
      }, { replace: true });
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Knowledge"
        description="The only facts the assistant may use. Changes apply to the next reply."
        actions={
          <>
            <a className={buttonClass()} href={apiUrl('/admin/knowledge/export')} download><Download /> Export</a>
            <Button onClick={() => navigate('/app/knowledge/import')}><Upload /> Import</Button>
            <div className="menu-wrap" ref={addRef}>
              <Button variant="primary" aria-haspopup="menu" aria-expanded={addOpen} onClick={() => setAddOpen(!addOpen)}><Plus /> Add entry</Button>
              {addOpen ? (
                <div className="menu" role="menu">
                  {(['product', 'policy', 'faq'] as const).map((value) => (
                    <button
                      key={value}
                      role="menuitem"
                      onClick={() => {
                        setAddOpen(false);
                        setDrawer({ mode: 'create', type: value });
                      }}
                    >
                      {typeLabels[value]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        }
      />

      <div className="tabs" role="tablist" aria-label="Entry type">
        {TABS.map((tab) => (
          <button key={tab.label} role="tab" className="tab" aria-selected={type === tab.value} onClick={() => setFilter('type', tab.value)}>
            {tab.label}
            {query.data ? <span className="count">{countFor(tab.value)}</span> : null}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input className="input" type="search" placeholder="Search titles and content" aria-label="Search knowledge" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select select-compact" aria-label="Visibility" value={enabled} onChange={(e) => setFilter('enabled', e.target.value)}>
          <option value="">Live and hidden</option>
          <option value="true">Live</option>
          <option value="false">Hidden</option>
        </select>
        <select className="select select-compact" aria-label="Sort" value={sort} onChange={(e) => setFilter('sort', e.target.value === 'title' ? '' : e.target.value)}>
          <option value="title">Title A–Z</option>
          <option value="updated">Recently updated</option>
        </select>
      </div>

      {query.isPending ? (
        <div className="panel"><SkeletonRows /></div>
      ) : query.isError ? (
        <div className="panel"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
      ) : query.data.items.length === 0 ? (
        <div className="panel">
          {q || enabled || type ? (
            <EmptyState
              title="No entries match"
              actions={<Button onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState title="The knowledge base is empty" actions={<Link className={buttonClass('primary')} to="/app/knowledge/import">Import a file</Link>}>
              Without entries, the assistant will refer every question to your team.
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
            <table className="table stack">
              <thead>
                <tr><th>Entry</th><th>Type</th><th>Updated</th><th>Live</th></tr>
              </thead>
              <tbody>
                {query.data.items.map((entry) => (
                  <tr key={entry.id} className="row-link" onClick={() => setDrawer({ mode: 'edit', id: entry.id })}>
                    <td style={{ maxWidth: 560 }}>
                      <button
                        type="button"
                        className="linklike cell-primary truncate"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawer({ mode: 'edit', id: entry.id });
                        }}
                      >
                        {entry.title}
                      </button>
                      <span className="cell-sub truncate" style={{ display: 'block' }}>{summary(entry)}</span>
                    </td>
                    <td className="hide-sm"><span className="badge">{typeLabels[entry.type]}</span></td>
                    <td className="muted hide-sm" style={{ whiteSpace: 'nowrap' }}>{relativeTime(entry.updatedAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          disabled={toggle.isPending && toggle.variables?.id === entry.id}
                          onChange={() => toggle.mutate(entry)}
                          aria-label={`${entry.title} is ${entry.enabled ? 'live' : 'hidden'}`}
                        />
                        <span aria-hidden />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={(p) => setFilter('page', String(p))} />
        </>
      )}

      {drawer ? <EntryDrawer key={drawer.mode === 'edit' ? drawer.id : drawer.type} target={drawer} onClose={closeDrawer} /> : null}
    </div>
  );
}
