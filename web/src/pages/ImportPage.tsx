import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/ConsoleLayout';
import { Button, ErrorState, useToast } from '../components/ui';
import { api, apiUrl } from '../lib/api';
import { relativeTime, typeLabels } from '../lib/format';
import type { ImportPlan, ImportRecord } from '../lib/types';

const ACTION_LABELS = { create: 'New', update: 'Update', unchanged: 'No change' };

export function ImportPage() {
  const client = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [committed, setCommitted] = useState<ImportPlan | null>(null);

  const history = useQuery({
    queryKey: ['knowledge', 'imports'],
    queryFn: () => api.get<{ items: ImportRecord[] }>('/admin/knowledge/imports'),
  });

  const preview = useMutation({
    mutationFn: (selected: File) => api.upload<ImportPlan>('/admin/knowledge/imports/preview', selected),
  });

  const commit = useMutation({
    mutationFn: (selected: File) => api.upload<ImportPlan>('/admin/knowledge/imports', selected),
    onSuccess: (plan) => {
      setCommitted(plan);
      setFile(null);
      preview.reset();
      client.invalidateQueries({ queryKey: ['knowledge'] });
      toast.success('Import complete. The assistant can use the new entries now.');
    },
  });

  const choose = (selected: File | undefined) => {
    if (!selected) return;
    setFile(selected);
    setCommitted(null);
    commit.reset();
    preview.mutate(selected);
  };

  const reset = () => {
    setFile(null);
    preview.reset();
    commit.reset();
    if (input.current) input.current.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files[0]);
  };

  const plan = preview.data;
  const writes = plan ? plan.summary.create + plan.summary.update : 0;

  return (
    <div className="page">
      <PageHeader
        back={<Link to="/app/knowledge" className="back-link"><ArrowLeft aria-hidden /> Knowledge</Link>}
        title="Import knowledge"
        description="Upload a CSV or JSON file. You'll see exactly what will change before anything is saved."
      />

      {committed ? (
        <div className="banner banner-good" role="status">
          <CheckCircle2 aria-hidden />
          <span>
            Imported {committed.filename}: {committed.summary.create} added, {committed.summary.update} updated, {committed.summary.unchanged} unchanged
            {committed.summary.failed ? `, ${committed.summary.failed} skipped because of errors` : ''}.
          </span>
        </div>
      ) : null}

      {!plan ? (
        <section className="panel panel-pad stack-md">
          <div
            className={`dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <FileUp aria-hidden />
            <p><strong>Drop a file here</strong> or choose one from your computer</p>
            <p className="muted">.csv or .json, up to 2 MB and 1,000 rows</p>
            <input ref={input} className="sr-only" type="file" accept=".csv,.json,text/csv,application/json" aria-label="Choose a file to import" onChange={(e) => choose(e.target.files?.[0])} />
            <Button loading={preview.isPending} onClick={() => input.current?.click()}>
              {preview.isPending ? `Checking ${file?.name ?? 'file'}…` : 'Choose file'}
            </Button>
          </div>
          {preview.isError ? <div className="banner banner-danger" role="alert"><AlertTriangle aria-hidden /><span>{preview.error.message}</span></div> : null}
          <div className="template-row">
            <span className="muted">Start from a template:</span>
            {(['product', 'policy', 'faq'] as const).map((type) => (
              <a key={type} href={apiUrl(`/admin/knowledge/templates/${type}`)} download>{typeLabels[type]} CSV</a>
            ))}
          </div>
          <p className="muted field-hint">
            Rows are matched to existing entries by title. In CSV files, separate list items with <code>|</code> and add specifications as <code>spec:weight</code> style columns.
            The Export button on the Knowledge page produces JSON you can edit and re-import.
          </p>
        </section>
      ) : (
        <section className="panel" aria-label="Import preview">
          <div className="panel-head">
            <div>
              <h2 className="panel-title truncate">{plan.filename}</h2>
              <p className="panel-sub tnum">
                {plan.summary.create} new · {plan.summary.update} updated · {plan.summary.unchanged} unchanged
                {plan.summary.failed ? ` · ${plan.summary.failed} with errors` : ''}
              </p>
            </div>
            <div className="page-head-actions">
              <Button onClick={reset}>Choose another file</Button>
              <Button variant="primary" disabled={writes === 0} loading={commit.isPending} onClick={() => file && commit.mutate(file)}>
                {writes === 0 ? 'Nothing to import' : `Import ${writes} ${writes === 1 ? 'entry' : 'entries'}`}
              </Button>
            </div>
          </div>
          {commit.isError ? <div className="banner banner-danger" role="alert" style={{ margin: '0 16px 16px' }}><AlertTriangle aria-hidden /><span>{commit.error.message}</span></div> : null}

          {plan.errors.length ? (
            <div className="import-errors">
              <h3><AlertTriangle aria-hidden /> {plan.errors.length} row{plan.errors.length === 1 ? '' : 's'} will be skipped</h3>
              <ul>
                {plan.errors.slice(0, 50).map((error) => (
                  <li key={error.row}>
                    <span className="tnum">Row {error.row}</span>
                    {error.title ? <strong> {error.title}</strong> : null}: {error.messages.join(' ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.rows.length ? (
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th className="num">Row</th><th>Title</th><th>Type</th><th>Change</th></tr></thead>
                <tbody>
                  {plan.rows.slice(0, 200).map((row) => (
                    <tr key={row.row}>
                      <td className="num muted">{row.row}</td>
                      <td>{row.title}</td>
                      <td>{typeLabels[row.type]}</td>
                      <td>
                        <span className={`badge${row.action === 'create' ? ' badge-good' : row.action === 'update' ? ' badge-warn' : ''}`}>{ACTION_LABELS[row.action]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.rows.length > 200 ? <p className="muted panel-empty">Showing the first 200 of {plan.rows.length} rows.</p> : null}
            </div>
          ) : null}
        </section>
      )}

      <section className="stack-sm">
        <h2 className="section-title">Import history</h2>
        {history.isError ? (
          <div className="panel"><ErrorState error={history.error} onRetry={() => history.refetch()} /></div>
        ) : history.data?.items.length ? (
          <div className="table-wrap">
            <table className="table stack">
              <thead><tr><th>File</th><th className="num">Added</th><th className="num">Updated</th><th className="num">Skipped</th><th>By</th><th>When</th></tr></thead>
              <tbody>
                {history.data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="cell-primary">{item.filename}</td>
                    <td className="num">{item.created}</td>
                    <td className="num">{item.updated}</td>
                    <td className="num">{item.failed}</td>
                    <td className="muted hide-sm">{item.importedBy}</td>
                    <td className="muted">{relativeTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : history.isSuccess ? (
          <p className="muted">No imports yet.</p>
        ) : null}
      </section>
    </div>
  );
}
