import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { PageHeader } from '../components/ConsoleLayout';
import { Button, ErrorState, Field, fieldErrors, ListEditor, SkeletonRows, useToast } from '../components/ui';
import { api } from '../lib/api';
import type { ProviderStatus, Settings } from '../lib/types';

interface SettingsResponse {
  settings: Settings;
  defaultModel: string;
}

export function SettingsPage() {
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsResponse>('/admin/settings') });
  const { hash } = useLocation();

  useEffect(() => {
    if (hash && query.isSuccess) document.querySelector(hash)?.scrollIntoView();
  }, [hash, query.isSuccess]);

  return (
    <div className="page">
      <PageHeader title="Settings" description="How the assistant behaves, the brand it represents, and how it's embedded." />
      {query.isPending ? (
        <div className="panel"><SkeletonRows rows={10} /></div>
      ) : query.isError ? (
        <div className="panel"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
      ) : (
        <div className="stack-lg">
          <SettingsForm key={JSON.stringify(query.data.settings)} initial={query.data.settings} defaultModel={query.data.defaultModel} />
          <AccountSection />
        </div>
      )}
    </div>
  );
}

function Section(props: { id?: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="settings-section" id={props.id}>
      <div className="settings-intro">
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      <div className="panel panel-pad form-stack">{props.children}</div>
    </section>
  );
}

function SettingsForm({ initial, defaultModel }: { initial: Settings; defaultModel: string }) {
  const client = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Settings>(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const setAssistant = <K extends keyof Settings['assistant']>(key: K, value: Settings['assistant'][K]) =>
    setForm((f) => ({ ...f, assistant: { ...f.assistant, [key]: value } }));
  const setBrand = <K extends keyof Settings['brand']>(key: K, value: Settings['brand'][K]) =>
    setForm((f) => ({ ...f, brand: { ...f.brand, [key]: value } }));

  const save = useMutation({
    mutationFn: () =>
      api.put<SettingsResponse>('/admin/settings', {
        ...form,
        assistant: { ...form.assistant, suggestions: form.assistant.suggestions.map((s) => s.trim()).filter(Boolean) },
        brand: { ...form.brand, uniqueSellingPoints: form.brand.uniqueSellingPoints.map((s) => s.trim()).filter(Boolean) },
      }),
    onSuccess: (data) => {
      client.setQueryData(['settings'], data);
      client.invalidateQueries({ queryKey: ['provider'] });
      toast.success('Settings saved. They apply to the next reply.');
    },
    onError: (err) => {
      if (Object.keys(fieldErrors(err)).length === 0) toast.error(err);
    },
  });

  const errors = fieldErrors(save.error);
  const errorCount = Object.keys(errors).length;

  return (
    <form
      className="stack-lg"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Section title="Assistant" description="The persona customers talk to and what it opens with.">
        <Field label="Name" error={errors['assistant.name']}>
          {(a) => <input {...a} className="input" value={form.assistant.name} onChange={(e) => setAssistant('name', e.target.value)} />}
        </Field>
        <Field label="Welcome message" error={errors['assistant.welcomeMessage']}>
          {(a) => <textarea {...a} className="textarea" rows={3} value={form.assistant.welcomeMessage} onChange={(e) => setAssistant('welcomeMessage', e.target.value)} />}
        </Field>
        <ListEditor
          label="Suggested question"
          addLabel="Add question"
          hint="Shown as shortcuts when a conversation starts. Up to 6."
          values={form.assistant.suggestions}
          onChange={(v) => setAssistant('suggestions', v)}
          max={6}
        />
      </Section>

      <Section title="Brand" description="Facts the assistant always knows, and the contacts it refers customers to.">
        <div className="form-grid">
          <Field label="Brand name" error={errors['brand.name']}>
            {(a) => <input {...a} className="input" value={form.brand.name} onChange={(e) => setBrand('name', e.target.value)} />}
          </Field>
          <Field label="Currency" error={errors['brand.currency']} hint="3-letter code, like USD">
            {(a) => <input {...a} className="input" maxLength={3} value={form.brand.currency} onChange={(e) => setBrand('currency', e.target.value)} />}
          </Field>
          <Field label="Support email" error={errors['brand.supportEmail']}>
            {(a) => <input {...a} className="input" type="email" value={form.brand.supportEmail} onChange={(e) => setBrand('supportEmail', e.target.value)} />}
          </Field>
          <Field label="Support phone" error={errors['brand.supportPhone']}>
            {(a) => <input {...a} className="input" value={form.brand.supportPhone} onChange={(e) => setBrand('supportPhone', e.target.value)} />}
          </Field>
          <Field label="Support hours" error={errors['brand.supportHours']}>
            {(a) => <input {...a} className="input" value={form.brand.supportHours} onChange={(e) => setBrand('supportHours', e.target.value)} />}
          </Field>
          <Field label="Website" error={errors['brand.website']}>
            {(a) => <input {...a} className="input" type="url" value={form.brand.website} onChange={(e) => setBrand('website', e.target.value)} />}
          </Field>
          <Field label="Tagline" className="span-2" error={errors['brand.tagline']}>
            {(a) => <input {...a} className="input" value={form.brand.tagline} onChange={(e) => setBrand('tagline', e.target.value)} />}
          </Field>
          <Field label="About" className="span-2" error={errors['brand.about']}>
            {(a) => <textarea {...a} className="textarea" rows={4} value={form.brand.about} onChange={(e) => setBrand('about', e.target.value)} />}
          </Field>
          <Field label="Handoff note" className="span-2" error={errors['brand.handoffNote']} hint="Tells the assistant how people can reach a human.">
            {(a) => <input {...a} className="input" value={form.brand.handoffNote} onChange={(e) => setBrand('handoffNote', e.target.value)} />}
          </Field>
        </div>
        <ListEditor label="Selling point" addLabel="Add selling point" values={form.brand.uniqueSellingPoints} onChange={(v) => setBrand('uniqueSellingPoints', v)} max={12} />
      </Section>

      <Section id="provider" title="AI provider" description="The model behind the assistant, and the live status of its connection.">
        <ProviderPanel
          model={form.assistant.model}
          defaultModel={defaultModel}
          onModel={(m) => setAssistant('model', m)}
        />
        <div className="form-grid">
          <Field label="Temperature" error={errors['assistant.temperature']} hint="0 to 2. Lower stays closer to the facts.">
            {(a) => (
              <input {...a} className="input tnum" type="number" min={0} max={2} step={0.1} value={form.assistant.temperature} onChange={(e) => setAssistant('temperature', e.target.valueAsNumber)} />
            )}
          </Field>
          <Field label="Maximum reply length (tokens)" error={errors['assistant.maxTokens']}>
            {(a) => (
              <input {...a} className="input tnum" type="number" min={50} max={8000} step={50} value={form.assistant.maxTokens} onChange={(e) => setAssistant('maxTokens', e.target.valueAsNumber)} />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Widget" description="Add the assistant to any website with one line of HTML.">
        <Field label="Accent color" error={errors['widget.accentColor']}>
          {(a) => (
            <div className="color-row">
              <input type="color" aria-label="Pick accent color" value={/^#[0-9a-fA-F]{6}$/.test(form.widget.accentColor) ? form.widget.accentColor : '#000000'} onChange={(e) => setForm((f) => ({ ...f, widget: { accentColor: e.target.value } }))} />
              <input {...a} className="input mono" value={form.widget.accentColor} onChange={(e) => setForm((f) => ({ ...f, widget: { accentColor: e.target.value } }))} />
            </div>
          )}
        </Field>
        <EmbedSnippet />
      </Section>

      <div className={`savebar${dirty ? ' visible' : ''}`}>
        {errorCount ? <span className="field-error" role="alert">Please fix {errorCount} highlighted field{errorCount === 1 ? '' : 's'}.</span> : <span className="muted">You have unsaved changes.</span>}
        <div className="page-head-actions">
          <Button disabled={!dirty} onClick={() => { setForm(initial); save.reset(); }}>Discard</Button>
          <Button type="submit" variant="primary" disabled={!dirty} loading={save.isPending}>Save changes</Button>
        </div>
      </div>
    </form>
  );
}

function ProviderPanel(props: { model: string | null; defaultModel: string; onModel(model: string | null): void }) {
  const status = useQuery({
    queryKey: ['provider'],
    queryFn: () => api.get<ProviderStatus>('/admin/provider'),
  });
  const data = status.data;
  const chosen = props.model ?? props.defaultModel;
  const unavailable = data?.reachable && !data.models.includes(chosen);

  return (
    <>
      <div className="provider-status">
        {status.isPending ? (
          <span className="muted">Checking connection…</span>
        ) : status.isError ? (
          <span className="status-line danger"><AlertTriangle aria-hidden /> {status.error.message}</span>
        ) : !data?.configured ? (
          <span className="status-line danger"><AlertTriangle aria-hidden /> No API key set. Add GROQ_API_KEY to the server's .env file and restart.</span>
        ) : !data.reachable ? (
          <span className="status-line danger"><AlertTriangle aria-hidden /> {data.error}</span>
        ) : (
          <span className="status-line good"><CheckCircle2 aria-hidden /> Connected to Groq · {data.models.length} models available</span>
        )}
        <Button variant="ghost" loading={status.isFetching} onClick={() => status.refetch()}>{status.isFetching ? null : <RefreshCw />} Recheck</Button>
      </div>
      <Field
        label="Model"
        error={unavailable ? `"${chosen}" isn't available to this API key. Replies will fail until you choose another.` : undefined}
        hint="The API key itself stays on the server and is never sent to the browser."
      >
        {(a) => (
          <select {...a} className="select" value={props.model ?? ''} onChange={(e) => props.onModel(e.target.value || null)}>
            <option value="">Server default ({props.defaultModel})</option>
            {props.model && !data?.models.includes(props.model) ? <option value={props.model}>{props.model}</option> : null}
            {data?.models.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
        )}
      </Field>
    </>
  );
}

function EmbedSnippet() {
  const toast = useToast();
  const snippet = `<script src="${window.location.origin}/widget.js" defer></script>`;
  return (
    <div className="field">
      <span className="field-label">Embed code</span>
      <div className="snippet">
        <code>{snippet}</code>
        <Button
          size="icon"
          aria-label="Copy embed code"
          onClick={() => {
            navigator.clipboard.writeText(snippet).then(
              () => toast.success('Embed code copied'),
              () => toast.error(new Error("Couldn't copy automatically. Select the text and copy it instead.")),
            );
          }}
        >
          <Copy />
        </Button>
      </div>
      <span className="field-hint">Paste it before the closing body tag on any page.</span>
    </div>
  );
}

function AccountSection() {
  const toast = useToast();
  const empty = { currentPassword: '', newPassword: '' };
  const [form, setForm] = useState(empty);
  const change = useMutation({
    mutationFn: () => api.post('/auth/password', form),
    onSuccess: () => {
      setForm(empty);
      toast.success('Password changed. Other sessions were signed out.');
    },
  });
  const errors = fieldErrors(change.error);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate();
      }}
    >
      <Section title="Account" description="Changing your password signs out your other sessions.">
        {change.isError && Object.keys(errors).length === 0 ? <div className="form-banner" role="alert">{change.error.message}</div> : null}
        <div className="form-grid">
          <Field label="Current password" error={errors.currentPassword}>
            {(a) => <input {...a} className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />}
          </Field>
          <Field label="New password" error={errors.newPassword} hint="At least 10 characters.">
            {(a) => <input {...a} className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />}
          </Field>
        </div>
        <div><Button type="submit" loading={change.isPending} disabled={!form.currentPassword || !form.newPassword}>Change password</Button></div>
      </Section>
    </form>
  );
}
