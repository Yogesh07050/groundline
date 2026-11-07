// Reads the Server-Sent Events stream of a chat reply from a POST request.
import { ApiError, apiUrl, toApiError } from './api';
import type { Message } from './types';

export interface ReplyHandlers {
  onDelta(text: string): void;
  onDone(message: Message): void;
}

export interface StreamFailure {
  message: string;
  retryable: boolean;
}

/** Parses complete SSE blocks from a buffer; returns events and the unread rest. */
export function parseSseBuffer(buffer: string): { events: Array<{ event: string; data: unknown }>; rest: string } {
  const events: Array<{ event: string; data: unknown }> = [];
  let rest = buffer;
  let boundary = rest.indexOf('\n\n');
  while (boundary !== -1) {
    const block = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    const event = /^event: (.*)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (event && data) events.push({ event, data: JSON.parse(data) });
    boundary = rest.indexOf('\n\n');
  }
  return { events, rest };
}

export async function streamReply(path: string, body: unknown, handlers: ReplyHandlers, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', "Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(0, 'stream_error', 'The server sent an empty response.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    for (const { event, data } of parsed.events) {
      if (event === 'delta') handlers.onDelta((data as { text: string }).text);
      if (event === 'done') {
        finished = true;
        handlers.onDone((data as { message: Message }).message);
      }
      if (event === 'error') {
        const failure = data as { code: string; message: string };
        throw new ApiError(502, failure.code, failure.message);
      }
    }
  }
  if (!finished) throw new ApiError(0, 'stream_interrupted', 'The connection dropped before the reply finished.');
}
