// Fetch wrapper for the JSON API. Non-2xx responses become ApiError, carrying the
// server's error code and per-field messages for forms.
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } };
  } | null;
  return new ApiError(
    res.status,
    body?.error?.code ?? 'unknown_error',
    body?.error?.message ?? 'Something went wrong. Please try again.',
    body?.error?.details?.fields ?? {},
  );
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'network_error', "Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  get: <T>(path: string) => send<T>(path),
  post: <T>(path: string, body?: unknown) => send<T>(path, json('POST', body)),
  put: <T>(path: string, body: unknown) => send<T>(path, json('PUT', body)),
  patch: <T>(path: string, body: unknown) => send<T>(path, json('PATCH', body)),
  delete: <T = void>(path: string) => send<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return send<T>(path, { method: 'POST', body: form });
  },
};

export const apiUrl = (path: string) => `${BASE}${path}`;

/** Build a query string, leaving out empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
