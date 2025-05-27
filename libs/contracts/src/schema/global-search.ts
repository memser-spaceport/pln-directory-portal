import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

const SearchQuerySchema = z.object({
  q: z.string().min(1),
});

const MatchSchema = z.object({
  field: z.string(),
  content: z.string(),
});

const SearchResultItemSchema = z.object({
  uid: z.string(),
  name: z.string(),
  matches: z.array(MatchSchema),
});

export const SearchResultSchema = z.object({
  events: z.array(SearchResultItemSchema),
  projects: z.array(SearchResultItemSchema),
  teams: z.array(SearchResultItemSchema),
  members: z.array(SearchResultItemSchema),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export class SearchQueryDto extends createZodDto(SearchQuerySchema) {}
export class ResponseSearchResultDto extends createZodDto(SearchResultSchema) {}
