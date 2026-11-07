// The chat pipeline: persist the message → retrieve facts → build the grounded
// prompt → stream from the model → classify and persist the reply. The server owns
// the history, so a client can't forge earlier turns to steer the assistant.
import type { AppConfig } from '../../config/env.js';
import { AppError, notFound } from '../../lib/errors.js';
import type {
  Channel,
  ConversationRepository,
  Message,
} from '../conversations/repository.js';
import type { RetrievalService } from '../retrieval/service.js';
import type { SettingsService } from '../settings/service.js';
import { type LlmClient, notConfiguredError } from './llm.js';
import { classifyOutcome, refersToEarlierTurn } from './outcome.js';
import { buildContext, buildSystemPrompt } from './prompt.js';

export interface ReplyListener {
  onUserMessage?(message: Message): void;
  onDelta(text: string): void;
}

export function createChatService(deps: {
  conversations: ConversationRepository;
  retrieval: RetrievalService;
  settings: SettingsService;
  llm: LlmClient;
  chat: AppConfig['chat'];
}) {
  const { conversations, retrieval, settings, llm, chat } = deps;
  // One reply at a time per conversation. In memory, as this is a single process.
  const inFlight = new Set<string>();

  function assertUsable(conversationId: string) {
    if (!llm.configured) throw notConfiguredError();
    const conversation = conversations.get(conversationId);
    if (!conversation) throw notFound('Conversation');
    if (inFlight.has(conversationId)) {
      throw new AppError(409, 'reply_in_progress', 'A reply is already being written for this conversation.');
    }
    return conversation;
  }

  async function generate(conversationId: string, listener: ReplyListener, signal?: AbortSignal): Promise<Message> {
    const all = conversations.messages(conversationId);
    const latest = all.at(-1);
    if (!latest || latest.role !== 'user') {
      throw new AppError(409, 'nothing_to_answer', 'The latest message has already been answered.');
    }

    const history = all.slice(0, -1).slice(-chat.maxHistoryMessages);
    const current = settings.get();
    const hits = retrieval.searchForTurn(latest.content, history);
    const model = settings.effectiveModel(current);

    const startedAt = Date.now();
    let content = '';
    let usage: { promptTokens: number; completionTokens: number } | null = null;

    const stream = llm.stream({
      model,
      temperature: current.assistant.temperature,
      maxTokens: current.assistant.maxTokens,
      signal,
      messages: [
        { role: 'system', content: buildSystemPrompt(current, buildContext(current, hits)) },
        ...history.map(({ role, content: text }) => ({ role, content: text })),
        { role: 'user', content: latest.content },
      ],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'delta') {
        content += chunk.text;
        listener.onDelta(chunk.text);
      } else {
        usage = chunk;
      }
    }

    content = content.trim();
    if (!content) throw new AppError(502, 'llm_empty_reply', 'The AI provider returned an empty reply.');

    return conversations.addAssistantMessage({
      conversationId,
      content,
      userQuery: latest.content,
      outcome: classifyOutcome({
        isMeaningful: retrieval.isMeaningful(latest.content),
        hasDirectMatch:
          retrieval.hasDirectMatch(latest.content) ||
          (history.length > 0 && hits.length > 0 && refersToEarlierTurn(latest.content)),
        reply: content,
        brand: current.brand,
      }),
      sources: hits.map(({ id, type, title, score }) => ({ id, type, title, score: Number(score.toFixed(3)) })),
      model,
      latencyMs: Date.now() - startedAt,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
    });
  }

  async function locked<T>(conversationId: string, run: () => Promise<T>): Promise<T> {
    inFlight.add(conversationId);
    try {
      return await run();
    } finally {
      inFlight.delete(conversationId);
    }
  }

  return {
    start: (channel: Channel, visitorTokenHash: string | null = null) => conversations.create(channel, visitorTokenHash),

    async send(conversationId: string, content: string, listener: ReplyListener, signal?: AbortSignal) {
      const conversation = assertUsable(conversationId);
      if (conversation.messageCount >= chat.maxMessagesPerConversation) {
        throw new AppError(409, 'conversation_full', 'This conversation is full. Please start a new one.');
      }
      return locked(conversationId, async () => {
        const userMessage = conversations.addUserMessage(conversationId, content);
        listener.onUserMessage?.(userMessage);
        return generate(conversationId, listener, signal);
      });
    },

    /** Generate again for an unanswered user message, e.g. after a provider failure. */
    async retry(conversationId: string, listener: ReplyListener, signal?: AbortSignal) {
      assertUsable(conversationId);
      return locked(conversationId, () => generate(conversationId, listener, signal));
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
