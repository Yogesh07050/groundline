// Classifies each reply for analytics and the knowledge-gap report. This is a
// heuristic over retrieval results and reply text; it measures how the assistant
// behaved, not whether a customer's problem was actually solved.
import type { Settings } from '../settings/service.js';

export type Outcome = 'answered' | 'referred' | 'no_match' | 'smalltalk';

// Phrasings models use when the facts aren't in the context. Collected from real
// replies; extend this list when the gap report misses one.
const ADMITS_NOT_KNOWING = new RegExp(
  [
    "\\b(i'm|i am) (sorry|afraid)\\b",
    "\\b(don'?t|do not|doesn'?t|does not) (have|know|specify|mention|include|list|say|cover)\\b",
    "\\b(isn'?t|is not|aren'?t|are not|wasn'?t) (specified|mentioned|listed|included|covered|available)\\b",
    "\\bnot (sure|specified|mentioned|listed|something i)\\b",
    "\\b(can'?t|cannot|couldn'?t|could not|unable to) (confirm|find|see|say|answer|tell)\\b",
    "\\bno (information|details|specific (information|details)|info)\\b",
  ].join('|'),
  'i',
);

export function classifyOutcome(input: {
  isMeaningful: boolean;
  hasDirectMatch: boolean;
  reply: string;
  brand: Settings['brand'];
}): Outcome {
  if (!input.isMeaningful) return 'smalltalk';

  const reply = input.reply.replace(/[‘’]/g, "'");
  const mentionsSupport =
    reply.toLowerCase().includes(input.brand.supportEmail.toLowerCase()) ||
    (input.brand.supportPhone !== '' && reply.includes(input.brand.supportPhone));

  // Mentioning support isn't enough: a return answer legitimately includes the
  // support address. It only counts when the assistant also says it doesn't know.
  if (mentionsSupport && ADMITS_NOT_KNOWING.test(reply)) return 'referred';
  return input.hasDirectMatch ? 'answered' : 'no_match';
}

/** "How much does that cost?" only makes sense alongside the previous turn. */
export const refersToEarlierTurn = (message: string) => /\b(that|this|those|these|it|they|them|one|ones)\b/i.test(message);

/** Normalizes a question so trivially different phrasings group in the gap report. */
export const normalizeQuery = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
