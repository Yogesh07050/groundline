// LLM provider boundary. Everything Groq-specific stays in this file, including
// translating provider failures into errors the rest of the app can act on.
import Groq from 'groq-sdk';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

export type LlmChunk =
  | { type: 'delta'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number };

export interface LlmClient {
  readonly configured: boolean;
  stream(request: LlmRequest): AsyncIterable<LlmChunk>;
  listModels(): Promise<string[]>;
}

export const notConfiguredError = () =>
  new AppError(503, 'llm_not_configured', 'The assistant is not configured yet: no Groq API key is set on the server.');

export function toProviderError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const status = err instanceof Groq.APIError ? err.status : undefined;
  switch (status) {
    case 401:
    case 403:
      return new AppError(502, 'llm_auth_failed', 'The AI provider rejected the configured API key.');
    case 404:
      return new AppError(502, 'llm_model_unavailable', 'The configured model is not available to this API key.');
    case 429:
      return new AppError(503, 'llm_rate_limited', 'The AI provider is rate limiting requests right now.');
    default:
      return new AppError(503, 'llm_unavailable', 'The AI provider could not be reached.');
  }
}

export function createGroqClient(config: AppConfig['groq']): LlmClient {
  const client = config.apiKey ? new Groq({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 2 }) : null;

  return {
    configured: client !== null,

    async *stream(request) {
      if (!client) throw notConfiguredError();
      const stream = await client.chat.completions.create(
        {
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_completion_tokens: request.maxTokens,
          stream: true,
        },
        { signal: request.signal },
      );

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield { type: 'delta', text };

        const usage = chunk.x_groq?.usage;
        if (usage) {
          yield { type: 'usage', promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
        }
      }
    },

    async listModels() {
      if (!client) throw notConfiguredError();
      const response = await client.models.list();
      return response.data.map((m) => m.id).sort();
    },
  };
}
