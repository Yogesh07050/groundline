// Shared UI primitives. Everything in the console is composed from these, which
// is what keeps forms, states, and dialogs consistent from page to page.
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Plus, X } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError } from '../lib/api';

// --- Buttons -----------------------------------------------------------------

type ButtonVariant = 'default' | 'primary' | 'danger' | 'solid-danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'icon';
  loading?: boolean;
}

export const buttonClass = (variant: ButtonVariant = 'default', size: 'md' | 'lg' | 'icon' = 'md') =>
  `btn${variant === 'default' ? '' : ` btn-${variant}`}${size === 'md' ? '' : ` btn-${size}`}`;

export function Button({ variant, size, loading, disabled, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

// --- Form fields -------------------------------------------------------------

export function Field(props: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (a11y: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${props.className ?? ''}`}>
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      {props.children({ id, 'aria-invalid': props.error ? true : undefined, 'aria-describedby': describedBy })}
      {props.error ? (
        <span id={`${id}-error`} className="field-error">
          {props.error}
        </span>
      ) : props.hint ? (
        <span id={`${id}-hint`} className="field-hint">
          {props.hint}
        </span>
      ) : null}
    </div>
  );
}

/** Editable list of short strings; empty rows are dropped by the caller on save. */
export function ListEditor(props: {
  label: string;
  values: string[];
  onChange(values: string[]): void;
  addLabel: string;
  error?: string;
  hint?: string;
  max?: number;
}) {
  const { values, onChange } = props;
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label" style={{ padding: 0, marginBottom: 5 }}>
        {props.label}
      </legend>
      <div className="list-editor">
        {values.map((value, index) => (
          <div className="list-editor-row" key={index}>
            <input
              className="input"
              aria-label={`${props.label} ${index + 1}`}
              value={value}
              onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${props.label.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          </div>
        ))}
        {props.max === undefined || values.length < props.max ? (
          <div>
            <Button variant="ghost" onClick={() => onChange([...values, ''])} style={{ paddingLeft: 0 }}>
              <Plus /> {props.addLabel}
            </Button>
          </div>
        ) : null}
      </div>
      {props.error ? <span className="field-error">{props.error}</span> : null}
      {props.hint && !props.error ? <span className="field-hint">{props.hint}</span> : null}
    </fieldset>
  );
}

// --- Dialogs -----------------------------------------------------------------

/** Native <dialog>: focus trapping, Esc, and the backdrop come from the browser. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return {
    ref,
    onCancel: (e: React.SyntheticEvent) => {
      e.preventDefault();
      onClose();
    },
    onClick: (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === ref.current) onClose();
    },
  };
}

export function ConfirmDialog(props: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm(): void;
  onClose(): void;
}) {
  const dialog = useDialog(props.onClose);
  return (
    <dialog className="modal" aria-labelledby="confirm-title" {...dialog}>
      <div className="modal-body">
        <h2 id="confirm-title">{props.title}</h2>
        <p>{props.body}</p>
      </div>
      <div className="modal-actions">
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant={props.danger ? 'solid-danger' : 'primary'} loading={props.loading} onClick={props.onConfirm}>
          {props.confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

export function Drawer(props: { title: string; onClose(): void; children: ReactNode; footer: ReactNode; onSubmit(): void }) {
  const dialog = useDialog(props.onClose);
  return (
    <dialog className="drawer" aria-labelledby="drawer-title" {...dialog}>
      <form
        noValidate
        style={{ display: 'contents' }}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit();
        }}
      >
        <div className="drawer-head">
          <h2 id="drawer-title">{props.title}</h2>
          <Button size="icon" variant="ghost" aria-label="Close" onClick={props.onClose}>
            <X />
          </Button>
        </div>
        <div className="drawer-body">{props.children}</div>
        <div className="drawer-foot">{props.footer}</div>
      </form>
    </dialog>
  );
}

// --- Data states -------------------------------------------------------------

export function EmptyState(props: { icon?: ReactNode; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="state">
      {props.icon ?? <Inbox aria-hidden />}
      <h3>{props.title}</h3>
      {props.children ? <p>{props.children}</p> : null}
      {props.actions ? <div className="actions">{props.actions}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <AlertCircle aria-hidden />
      <h3>This couldn't be loaded</h3>
      <p>{error instanceof Error ? error.message : 'Something went wrong.'}</p>
      {onRetry ? (
        <div className="actions">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }} aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${92 - (i % 3) * 14}%` }} />
      ))}
    </div>
  );
}

export function Pagination(props: { page: number; pageSize: number; total: number; onPage(page: number): void }) {
  const { page, pageSize, total, onPage } = props;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span className="tnum">
        {first}–{last} of {total}
      </span>
      {pages > 1 ? (
        <div className="pages">
          <Button size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft />
          </Button>
          <span className="tnum">
            Page {page} of {pages}
          </span>
          <Button size="icon" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// --- Toasts ------------------------------------------------------------------

interface ToastApi {
  success(message: string): void;
  error(err: unknown): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; error: boolean }>>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, error: boolean) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-2), { id, message, error }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), error ? 6000 : 3500);
  }, []);

  const value = useMemo<ToastApi>(
    () => ({
      success: (message) => push(message, false),
      error: (err) => push(err instanceof Error ? err.message : 'Something went wrong.', true),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' toast-error' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside ToastProvider');
  return toast;
}

export const fieldErrors = (error: unknown): Record<string, string> => (error instanceof ApiError ? error.fields : {});

/** Delays a fast-changing value, for search boxes. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
