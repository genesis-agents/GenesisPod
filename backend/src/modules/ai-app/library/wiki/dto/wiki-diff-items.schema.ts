import { z } from "zod";

/**
 * WikiDiff.items shape (v1.5.3 §11.1 zod schema).
 *
 * apply / dismiss must zod parse `WikiDiff.items` BEFORE entering the Prisma
 * transaction (security R3 P2: defends against malicious / buggy ingest
 * writing illegal fields into DB).
 *
 * Limits chosen per v1.5.3 §11.1:
 *  - slug: a-z0-9 + hyphens, 2-200 chars, no leading/trailing hyphens
 *  - body: ≤ 200_000 chars per page
 *  - oneLiner: ≤ 280 chars
 *  - sources: ≤ 50 per page
 *  - creates: ≤ 100 per diff
 *  - updates: ≤ 100 per diff
 *  - deletes: ≤ 20 per diff (delete sparingly)
 */

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$/;

export const WikiPageSourceItemSchema = z
  .object({
    // Accept any non-empty string. Service layer enforces the documentId is in
    // the caller-supplied whitelist (LLMs hallucinate UUIDs even when given the
    // real ones; strict uuid() here would fail entire diffs over one bad cite).
    documentId: z.string().min(1).max(200),
    spanStart: z.number().int().min(0),
    spanEnd: z.number().int().min(0),
    quote: z.string().min(1).max(2000),
  })
  .refine((s) => s.spanStart <= s.spanEnd, {
    message: "spanStart must be <= spanEnd",
  });

export const WikiPageCategorySchema = z.enum([
  "ENTITY",
  "CONCEPT",
  "SUMMARY",
  "SOURCE",
]);

export const WikiDiffCreateItemSchema = z.object({
  slug: z.string().regex(SLUG_REGEX),
  title: z.string().min(1).max(500),
  category: WikiPageCategorySchema,
  body: z.string().min(1).max(200_000),
  oneLiner: z.string().min(1).max(280),
  sources: z.array(WikiPageSourceItemSchema).max(50),
});

export const WikiDiffUpdateItemSchema = z.object({
  slug: z.string().regex(SLUG_REGEX),
  newBody: z.string().min(1).max(200_000),
  newOneLiner: z.string().min(1).max(280).optional(),
  sources: z.array(WikiPageSourceItemSchema).max(50).optional(),
});

export const WikiDiffItemsSchema = z.object({
  creates: z.array(WikiDiffCreateItemSchema).max(100),
  updates: z.array(WikiDiffUpdateItemSchema).max(100),
  deletes: z.array(z.string().regex(SLUG_REGEX)).max(20),
});

export type WikiDiffItems = z.infer<typeof WikiDiffItemsSchema>;
export type WikiDiffCreateItem = z.infer<typeof WikiDiffCreateItemSchema>;
export type WikiDiffUpdateItem = z.infer<typeof WikiDiffUpdateItemSchema>;
export type WikiPageSourceItem = z.infer<typeof WikiPageSourceItemSchema>;
