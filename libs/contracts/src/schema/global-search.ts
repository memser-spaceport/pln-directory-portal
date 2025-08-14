import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  strict: z.union([z.boolean(), z.string()])
          .transform(v => {
            if (typeof v === 'boolean') return v;
            return ['true', '1', 'yes', 'on'].includes(v.toLowerCase());
          })
          .optional()
          .default(true)
});

const MatchSchema = z.object({
  field: z.string(),
  content: z.string(),
});

const SearchResultItemSchema = z.object({
  uid: z.string(),
  name: z.string(),
  image: z.string(),
  index: z.string(),
  matches: z.array(MatchSchema),
});

export const SearchResultSchema = z.object({
  events: z.array(SearchResultItemSchema),
  projects: z.array(SearchResultItemSchema),
  teams: z.array(SearchResultItemSchema),
  members: z.array(SearchResultItemSchema),
  top: z.array(SearchResultItemSchema),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export class SearchQueryDto extends createZodDto(SearchQuerySchema) {}
export class ResponseSearchResultDto extends createZodDto(SearchResultSchema) {}
