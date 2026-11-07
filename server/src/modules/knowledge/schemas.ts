import { z } from 'zod';

const required = (max: number) => z.string().trim().min(1, 'Required').max(max);
const listOf = (max: number, count: number) => z.array(required(max)).max(count);

export const productData = z.object({
  category: required(80),
  price: z.number({ error: 'Enter a price' }).min(0, 'Price cannot be negative').max(1_000_000),
  availability: required(80),
  colors: listOf(60, 30),
  shortDescription: required(400),
  highlights: listOf(200, 20),
  specs: z.record(z.string().trim().min(1).max(60), z.string().trim().max(200)),
  bestFor: z.string().trim().max(300),
  warranty: z.string().trim().max(120),
});

export const policyData = z.object({
  summary: required(800),
  details: listOf(500, 30),
});

export const faqData = z.object({
  answer: required(2000),
});

const base = { title: required(200), enabled: z.boolean().default(true) };

export const knowledgeInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('product'), ...base, data: productData }),
  z.object({ type: z.literal('policy'), ...base, data: policyData }),
  z.object({ type: z.literal('faq'), ...base, data: faqData }),
]);

export type KnowledgeInput = z.infer<typeof knowledgeInput>;
export type KnowledgeType = KnowledgeInput['type'];
export type ProductData = z.infer<typeof productData>;

export type KnowledgeEntry = KnowledgeInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
