// Turns knowledge entries into the plain-text documents that get indexed and,
// when retrieved, shown to the model as facts.
import type { KnowledgeEntry } from '../knowledge/schemas.js';

export interface SearchDocument {
  id: string;
  type: KnowledgeEntry['type'];
  title: string;
  text: string;
}

export function toDocument(entry: KnowledgeEntry): SearchDocument {
  const { id, type, title } = entry;
  switch (entry.type) {
    case 'product': {
      const p = entry.data;
      const specs = Object.entries(p.specs)
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
      return {
        id,
        type,
        title,
        text:
          `${title} (${p.category}). Price: $${p.price}. Availability: ${p.availability}. ` +
          `Colors: ${p.colors.join(', ')}. ${p.shortDescription} ` +
          `Highlights: ${p.highlights.join('; ')}. Specs: ${specs}. ` +
          `Best for: ${p.bestFor}. Warranty: ${p.warranty}.`,
      };
    }
    case 'policy':
      return {
        id,
        type,
        title,
        text: `${title} policy. ${entry.data.summary} Details: ${entry.data.details.join(' ')}`,
      };
    case 'faq':
      return { id, type, title, text: `Q: ${title} A: ${entry.data.answer}` };
  }
}
