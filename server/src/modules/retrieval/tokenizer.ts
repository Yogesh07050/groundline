const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for',
  'with', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'can',
  'could', 'would', 'should', 'i', 'you', 'we', 'they', 'it', 'this', 'that',
  'my', 'your', 'me', 'at', 'as', 'by', 'from', 'about', 'how', 'what', 'which',
  'who', 'when', 'where', 'why', 'there', 'their', 'have', 'has', 'had', 'will',
  'any', 'some', 'get', 'got', 'please', 'tell', 'need', 'want', 'looking',
  // Conversational filler, so greetings and thanks don't match products by chance.
  'hi', 'hello', 'hey', 'thanks', 'thank', 'ok', 'okay', 'bye', 'yes', 'no', 'those', 'these', 'them',
  'much', 'many', 'great', 'good', 'like', 'just', 'also', 'so', 'am', 'im', 'its', 'our', 'us', 'give',
  'one', 'ones', 'right', 'now',
]);

/**
 * A small suffix stemmer, enough that "returns"/"returned" and "earbud"/"earbuds"
 * match. A full Porter stemmer would be overkill for short support content.
 */
export function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  let w = word;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (/(ches|shes|sses|xes|zes)$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);

  if (w.length > 5 && w.endsWith('ing')) w = undouble(w.slice(0, -3));
  else if (w.length > 4 && w.endsWith('ed')) w = undouble(w.slice(0, -2));
  return w.endsWith('e') && w.length > 4 ? w.slice(0, -1) : w;
}

const undouble = (w: string) => (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ss|ll|zz)$/.test(w) ? w.slice(0, -1) : w);

export function tokenize(text: string): string[] {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map(stem);
}
