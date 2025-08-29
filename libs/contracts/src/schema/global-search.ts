import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

/**
 * Query DTO: `strict` may come as boolean-ish strings.
 */
export const SearchQuerySchema = z.object({
  q: z.string().min(1),
  strict: z.union([z.boolean(), z.string()])
    .transform(v => {
      if (typeof v === 'boolean') return v;
      return ['true', '1', 'yes', 'on'].includes(v.toLowerCase());
    })
    .optional()
    .default(true),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export class SearchQueryDto extends createZodDto(SearchQuerySchema) {}

/**
 * Match snippet used in results highlighting.
 */
export const MatchSchema = z.object({
  field: z.string(),
  content: z.string(),
});

/**
 * Single search result item across any index.
 * - `index` is the logical section name (events/projects/teams/members/forumThreads)
 * - `kind` distinguishes special result shapes (here: forum threads)
 * - `source` holds the raw OpenSearch document (optional pass-through)
 */
export const SearchResultItemSchema = z.object({
  uid: z.string(),
  name: z.string(),
  image: z.string().optional().default(''),
  index: z.string(),
  matches: z.array(MatchSchema),

  // Optional metadata
  kind: z.enum(['forum_thread']).optional(),
  source: z.any().optional(),

  // Members-only extra (kept for backward compatibility)
  scheduleMeetingCount: z.number().optional(),

  // Forum thread extras (one document per thread)
  topicTitle: z.string().optional(),
  topicSlug: z.string().optional(),
  topicUrl: z.string().optional(),
  replyCount: z.number().optional(),
  lastReplyAt: z.any().optional(), // Date or ISO string depending on serializer
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

/**
 * Full response shape with per-section arrays and a combined "top".
 * Adds `forumThreads` for the unified forum thread index.
 */
export const SearchResultSchema = z.object({
  events: z.array(SearchResultItemSchema),
  projects: z.array(SearchResultItemSchema),
  teams: z.array(SearchResultItemSchema),
  members: z.array(SearchResultItemSchema),

  // Unified forum section
  forumThreads: z.array(SearchResultItemSchema).optional().default([]),

  // Global top-N list (score-ranked)
  top: z.array(SearchResultItemSchema),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export class ResponseSearchResultDto extends createZodDto(SearchResultSchema) {}
