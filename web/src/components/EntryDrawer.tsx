// Create and edit form for knowledge entries, with type-specific fields. Validation
// messages come from the server, so rules live in exactly one place.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { typeLabels } from '../lib/format';
import type { KnowledgeEntry, KnowledgeType, ProductData } from '../lib/types';
import { Button, ConfirmDialog, Drawer, ErrorState, Field, fieldErrors, ListEditor, SkeletonRows, useToast } from './ui';

export type DrawerTarget =
  | { mode: 'edit'; id: string }
  | { mode: 'create'; type: KnowledgeType; title?: string; fromGap?: string };

interface Draft {
  title: string;
  enabled: boolean;
  // Product. Price stays a string while typing, so "12." isn't rewritten mid-entry.
  category: string;
  price: string;
  availability: string;
  colors: string[];
  shortDescription: string;
  highlights: string[];
  specs: Array<[string, string]>;
  bestFor: string;
  warranty: string;
  // Policy
  summary: string;
  details: string[];
  // FAQ
  answer: string;
}

const emptyDraft = (title = ''): Draft => ({
  title,
  enabled: true,
  category: '',
  price: '',
  availability: 'In stock',
  colors: [],
  shortDescription: '',
  highlights: [],
  specs: [],
  bestFor: '',
  warranty: '',
  summary: '',
  details: [],
  answer: '',
});

function fromEntry(entry: KnowledgeEntry): Draft {
  const base = { ...emptyDraft(entry.title), enabled: entry.enabled };
  switch (entry.type) {
    case 'product': {
      const d: ProductData = entry.data;
      return { ...base, ...d, price: String(d.price), specs: Object.entries(d.specs) };
    }
    case 'policy':
      return { ...base, summary: entry.data.summary, details: entry.data.details };
    case 'faq':
      return { ...base, answer: entry.data.answer };
  }
}

const clean = (list: string[]) => list.map((v) => v.trim()).filter(Boolean);

function toPayload(type: KnowledgeType, draft: Draft) {
  const common = { type, title: draft.title, enabled: draft.enabled };
  switch (type) {
    case 'product':
      return {
        ...common,
        data: {
          category: draft.category,
          // An empty or malformed price is sent as null so the server reports it on the field.
          price: draft.price.trim() !== '' && Number.isFinite(Number(draft.price)) ? Number(draft.price) : null,
          availability: draft.availability,
          colors: clean(draft.colors),
          shortDescription: draft.shortDescription,
          highlights: clean(draft.highlights),
          specs: Object.fromEntries(draft.specs.filter(([key, value]) => key.trim() && value.trim()).map(([k, v]) => [k.trim(), v.trim()])),
          bestFor: draft.bestFor,
          warranty: draft.warranty,
        },
      };
    case 'policy':
      return { ...common, data: { summary: draft.summary, details: clean(draft.details) } };
    case 'faq':
      return { ...common, data: { answer: draft.answer } };
  }
}

export function EntryDrawer({ target, onClose }: { target: DrawerTarget; onClose(): void }) {
  const editing = target.mode === 'edit';
  const existing = useQuery({
    queryKey: ['knowledge-entry', editing ? target.id : ''],
    queryFn: () => api.get<KnowledgeEntry>(`/admin/knowledge/${(target as { id: string }).id}`),
    enabled: editing,
    gcTime: 0,
  });

  if (editing && (existing.isPending || existing.isError)) {
    return (
      <Drawer title="Entry" onClose={onClose} onSubmit={() => undefined} footer={<Button onClick={onClose}>Close</Button>}>
        {existing.isPending ? <SkeletonRows /> : <ErrorState error={existing.error} onRetry={() => existing.refetch()} />}
      </Drawer>
    );
  }
  return <EntryForm target={target} entry={existing.data} onClose={onClose} />;
}

function EntryForm({ target, entry, onClose }: { target: DrawerTarget; entry?: KnowledgeEntry; onClose(): void }) {
  const client = useQueryClient();
  const toast = useToast();
  const type = entry?.type ?? (target as { type: KnowledgeType }).type;
  const [draft, setDraft] = useState<Draft>(() =>
    entry ? fromEntry(entry) : emptyDraft(target.mode === 'create' ? target.title : ''),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const refresh = () => {
    client.invalidateQueries({ queryKey: ['knowledge'] });
    client.invalidateQueries({ queryKey: ['overview'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(type, draft);
      const saved = entry
        ? await api.put<KnowledgeEntry>(`/admin/knowledge/${entry.id}`, payload)
        : await api.post<KnowledgeEntry>('/admin/knowledge', payload);
      // A gap answered from the report shouldn't keep showing up there.
      if (target.mode === 'create' && target.fromGap) {
        await api.post('/admin/analytics/gaps/dismiss', { query: target.fromGap });
        client.invalidateQueries({ queryKey: ['gaps'] });
      }
      return saved;
    },
    onSuccess: () => {
      refresh();
      toast.success(entry ? 'Entry saved' : 'Entry added. The assistant can use it now.');
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/knowledge/${entry!.id}`),
    onSuccess: () => {
      refresh();
      toast.success('Entry deleted');
      onClose();
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error(err);
    },
  });

  const errors = fieldErrors(save.error);
  const hasFieldErrors = Object.keys(errors).length > 0;
  const titleLabel = type === 'faq' ? 'Question' : type === 'product' ? 'Product name' : 'Title';

  useEffect(() => {
    if (hasFieldErrors) document.querySelector<HTMLElement>('.drawer [aria-invalid="true"]')?.focus();
  }, [hasFieldErrors, save.error]);

  return (
    <Drawer
      title={entry ? `Edit ${typeLabels[type].toLowerCase()}` : `Add ${typeLabels[type].toLowerCase()}`}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      footer={
        <>
          {entry ? <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button> : null}
          <span className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{entry ? 'Save changes' : 'Add entry'}</Button>
        </>
      }
    >
      <div className="form-stack">
        {save.isError ? <div className="form-banner" role="alert">{hasFieldErrors ? 'Please fix the highlighted fields.' : save.error.message}</div> : null}

        <Field label={titleLabel} error={errors.title}>
          {(a) => <input {...a} className="input" value={draft.title} onChange={(e) => set('title', e.target.value)} autoFocus={!entry} />}
        </Field>

        {type === 'faq' ? (
          <Field label="Answer" error={errors['data.answer']} hint="Write it the way you'd want the assistant to state it.">
            {(a) => <textarea {...a} className="textarea" rows={6} value={draft.answer} onChange={(e) => set('answer', e.target.value)} />}
          </Field>
        ) : null}

        {type === 'policy' ? (
          <>
            <Field label="Summary" error={errors['data.summary']}>
              {(a) => <textarea {...a} className="textarea" rows={3} value={draft.summary} onChange={(e) => set('summary', e.target.value)} />}
            </Field>
            <ListEditor label="Detail" addLabel="Add detail" values={draft.details} onChange={(v) => set('details', v)} max={30} />
          </>
        ) : null}

        {type === 'product' ? (
          <>
            <div className="form-grid">
              <Field label="Category" error={errors['data.category']}>
                {(a) => <input {...a} className="input" value={draft.category} onChange={(e) => set('category', e.target.value)} />}
              </Field>
              <Field label="Price" error={errors['data.price']}>
                {(a) => <input {...a} className="input tnum" inputMode="decimal" value={draft.price} onChange={(e) => set('price', e.target.value)} />}
              </Field>
              <Field label="Availability" error={errors['data.availability']} hint='For example "In stock" or "Pre-order"'>
                {(a) => <input {...a} className="input" value={draft.availability} onChange={(e) => set('availability', e.target.value)} />}
              </Field>
              <Field label="Warranty" error={errors['data.warranty']}>
                {(a) => <input {...a} className="input" value={draft.warranty} onChange={(e) => set('warranty', e.target.value)} />}
              </Field>
            </div>
            <Field label="Short description" error={errors['data.shortDescription']}>
              {(a) => <textarea {...a} className="textarea" rows={2} value={draft.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />}
            </Field>
            <Field label="Best for" error={errors['data.bestFor']} hint="Helps the assistant recommend it for the right need.">
              {(a) => <input {...a} className="input" value={draft.bestFor} onChange={(e) => set('bestFor', e.target.value)} />}
            </Field>
            <ListEditor label="Highlight" addLabel="Add highlight" values={draft.highlights} onChange={(v) => set('highlights', v)} max={20} />
            <ListEditor label="Color" addLabel="Add color" values={draft.colors} onChange={(v) => set('colors', v)} max={30} />
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ padding: 0, marginBottom: 5 }}>Specifications</legend>
              <div className="list-editor">
                {draft.specs.map(([key, value], index) => (
                  <div className="list-editor-row" key={index}>
                    <input
                      className="input spec-key"
                      placeholder="Name"
                      aria-label={`Specification ${index + 1} name`}
                      value={key}
                      onChange={(e) => set('specs', draft.specs.map((s, i) => (i === index ? [e.target.value, s[1]] : s)))}
                    />
                    <input
                      className="input"
                      placeholder="Value"
                      aria-label={`Specification ${index + 1} value`}
                      value={value}
                      onChange={(e) => set('specs', draft.specs.map((s, i) => (i === index ? [s[0], e.target.value] : s)))}
                    />
                    <Button size="icon" variant="ghost" aria-label={`Remove specification ${index + 1}`} onClick={() => set('specs', draft.specs.filter((_, i) => i !== index))}>
                      <X />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button variant="ghost" style={{ paddingLeft: 0 }} onClick={() => set('specs', [...draft.specs, ['', '']])}><Plus /> Add specification</Button>
                </div>
              </div>
            </fieldset>
          </>
        ) : null}

        <label className="check">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          Live: the assistant can use this entry
        </label>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          danger
          title="Delete this entry?"
          body={`"${draft.title}" will be removed and the assistant will stop using it. To keep it without using it, turn off Live instead.`}
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </Drawer>
  );
}
