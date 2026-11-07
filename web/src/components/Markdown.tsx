// Renders the small markdown subset the assistant uses, as React elements. Text is
// never parsed as HTML, so a reply can't inject markup into the console.
import type { ReactNode } from 'react';

const INLINE = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(`[^`\n]+`)|([\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-zA-Z]{2,})|(https?:\/\/[^\s<)]+)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    const token = match[0];
    if (index > last) out.push(text.slice(last, index));
    if (match[1]) out.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else if (match[2]) out.push(<em key={index}>{token.slice(1, -1)}</em>);
    else if (match[3]) out.push(<code key={index}>{token.slice(1, -1)}</code>);
    else if (match[4]) out.push(<a key={index} href={`mailto:${token}`}>{token}</a>);
    else {
      const url = token.replace(/[.,;:!?]+$/, '');
      out.push(<a key={index} href={url} target="_blank" rel="noopener noreferrer">{url}</a>);
      if (url.length < token.length) out.push(token.slice(url.length));
    }
    last = index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const open: { type: 'ul' | 'ol' | null; items: string[] } = { type: null, items: [] };

  const flush = () => {
    if (!open.type) return;
    const items = open.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(open.type === 'ul' ? <ul key={blocks.length}>{items}</ul> : <ol key={blocks.length}>{items}</ol>);
    open.type = null;
    open.items = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (open.type !== type) {
        flush();
        open.type = type;
      }
      open.items.push((bullet ?? numbered)![1]!);
    } else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#{1,6}\s+/, ''))}</p>);
    }
  }
  flush();
  return <div className="md">{blocks}</div>;
}
