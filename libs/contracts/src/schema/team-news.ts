import { z } from 'zod';

export const NewsEventTypeSchema = z.enum([
  'FUNDING',
  'LAUNCH',
  'PARTNERSHIP',
  'ANNOUNCEMENT',
  'MILESTONE',
  'OTHER',
]);

export const NewsDiscoveryOutcomeSchema = z.enum(['OK', 'NO_WEBSITE', 'AGENT_FAILED']);

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }
  return [value];
};

const ListParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => toStringArray(v));

export const TeamNewsListQueryParams = z.object({
  focus: ListParam,
  eventType: ListParam,
  q: z.string().optional(),
  since: z.string().optional(),
  windowDays: z
    .preprocess(
      (v) => (v === undefined || v === '' ? undefined : Number(v)),
      z.number().int().min(1).max(365).optional()
    )
    .default(14),
  page: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1))
    .optional()
    .default(1),
  limit: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(200))
    .optional()
    .default(50),
});

export type TeamNewsListQuery = z.infer<typeof TeamNewsListQueryParams>;

// Per-item summary of forum discussions linked to this news item.
// `count` is the number of TeamNewsForumLink rows; `latestTopicUrl` is the
// most recently-linked topic's URL (used by the frontend to render
// "Join discussion ›" linking straight to that thread when count === 1).
export const TeamNewsDiscussionSchema = z.object({
  count: z.number().int().min(0),
  latestTopicUrl: z.string().nullable(),
});

export const TeamNewsItemSchema = z.object({
  uid: z.string(),
  teamUid: z.string(),
  teamName: z.string(),
  teamLogoUrl: z.string().nullable(),
  eventType: NewsEventTypeSchema,
  eventDate: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  sourceUrl: z.string(),
  sourceDomain: z.string().nullable(),
  tags: z.array(z.string()),
  focusAreas: z.array(z.string()),
  subFocusAreas: z.array(z.string()),
  createdAt: z.string(),
  discussion: TeamNewsDiscussionSchema,
  // True when the authenticated caller follows this item's team. Always false
  // for anonymous requests. Followed-team news is also surfaced first in the
  // flat list (`GET /v1/team-news`) and within each focus-area group.
  isFollowed: z.boolean(),
});

// POST /v1/team-news/{newsItemUid}/discussions — links a TeamNewsItem to a
// forum topic that was just created via the home-page "Discuss" flow.
// Idempotent on (newsItemUid, forumTopicId).
export const CreateTeamNewsDiscussionRequestSchema = z.object({
  forumTopicId: z.number().int().positive(),
  forumTopicSlug: z.string().min(1),
  forumTopicUrl: z.string().min(1),
});

export const TeamNewsForumLinkSchema = z.object({
  uid: z.string(),
  newsItemUid: z.string(),
  forumTopicId: z.number().int(),
  forumTopicSlug: z.string(),
  forumTopicUrl: z.string(),
  createdByUid: z.string().nullable(),
  createdAt: z.string(),
});

export const CreateTeamNewsDiscussionResponseSchema = z.object({
  link: TeamNewsForumLinkSchema,
  created: z.boolean(),
});

export const TeamNewsListResponseSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(TeamNewsItemSchema),
});

export const TeamNewsFocusGroupSchema = z.object({
  focusArea: z.object({
    uid: z.string(),
    title: z.string(),
  }),
  total: z.number().int(),
  items: z.array(TeamNewsItemSchema),
});

export const TeamNewsGroupedResponseSchema = z.object({
  windowDays: z.number().int(),
  generatedAt: z.string(),
  groups: z.array(TeamNewsFocusGroupSchema),
});

export const TeamNewsFacetItemSchema = z.object({
  value: z.string(),
  count: z.number().int(),
});

export const TeamNewsFiltersResponseSchema = z.object({
  eventType: z.array(TeamNewsFacetItemSchema),
  focus: z.array(TeamNewsFacetItemSchema),
});

// Service ingest. The producer (e.g. pln-data-enrichment) is responsible for
// noise filtering, classification, and source-URL liveness checks before
// posting here. The directory just persists what it's told, idempotently.
export const TeamNewsIngestItemSchema = z.object({
  teamUid: z.string(),
  eventDate: z.string(),
  title: z.string().min(1),
  summary: z.string().optional(),
  sourceUrl: z.string().min(1),
  eventType: NewsEventTypeSchema,
  tags: z.array(z.string()),
  rawPayload: z.unknown().optional(),
});

export const IngestTeamNewsDtoSchema = z.object({
  items: z.array(TeamNewsIngestItemSchema),
  runId: z.string().optional(),
  source: z.string().optional(),
  enrichmentSource: z.string().optional(),
});

export const IngestTeamNewsResponseSchema = z.object({
  received: z.number().int(),
  ingested: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  rejectedNoSource: z.number().int(),
  rejectedUnknownTeam: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.string()).optional(),
});

// Service: enrichment per team
export const UpdateTeamNewsEnrichmentDtoSchema = z.object({
  teamUid: z.string(),
  lastDiscoveryAt: z.string().optional(),
  lastDiscoveryOutcome: NewsDiscoveryOutcomeSchema.optional(),
  enrichmentSource: z.string().optional(),
});

export const BatchUpdateTeamNewsEnrichmentDtoSchema = z.object({
  items: z.array(UpdateTeamNewsEnrichmentDtoSchema),
});

export const BatchUpdateTeamNewsEnrichmentResponseSchema = z.object({
  received: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.string()).optional(),
});

export const TeamNewsEnrichmentSchema = z.object({
  uid: z.string(),
  teamUid: z.string(),
  lastDiscoveryAt: z.string().nullable(),
  lastDiscoveryOutcome: NewsDiscoveryOutcomeSchema.nullable(),
  recentNewsCount: z.number().int(),
  enrichmentSource: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TeamWithNewsEnrichmentSchema = z.object({
  uid: z.string(),
  name: z.string(),
  priority: z.number().nullable(),
  website: z.string().nullable(),
  twitterHandler: z.string().nullable(),
  linkedinHandler: z.string().nullable(),
  focusAreas: z.array(z.string()),
  subFocusAreas: z.array(z.string()),
  enrichment: TeamNewsEnrichmentSchema.nullable(),
});

export const TeamsWithNewsEnrichmentResponseSchema = z.object({
  teams: z.array(TeamWithNewsEnrichmentSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export const TeamNewsPerTeamResponseSchema = z.object({
  teamUid: z.string(),
  teamName: z.string(),
  items: z.array(TeamNewsItemSchema),
});

export const TeamNewsByTeamQueryParams = z.object({
  q: z.string().optional(),
  page: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1))
    .optional()
    .default(1),
  limit: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(200))
    .optional()
    .default(50),
});

export const TeamNewsByTeamResponseSchema = z.object({
  teamUid: z.string(),
  teamName: z.string(),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(TeamNewsItemSchema),
});

// Recent network news across all teams, ordered newest-first. Consumed by the
// notification service (pl-notification-service) when it builds the combined
// "Daily Forum Digest + Latest Network News" email. Public (no service auth).
//
// Selection is by ingestion time (`createdAt`), NOT `eventDate`: the digest is a
// "what was ingested since the last digest" feed, so the notification service
// passes a watermark window `(sinceCreatedAt, untilCreatedAt]` = (last
// successful digest run, this run). createdAt is monotonic and never backdated,
// which guarantees no gaps and no duplicates across daily runs even though
// `eventDate` can trail ingestion by days. `eventDate` is still used for display
// ("19d ago") and ordering, matching the public News feed.
export const TeamNewsRecentQueryParams = z.object({
  sinceCreatedAt: z.string().optional(),
  untilCreatedAt: z.string().optional(),
  limit: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100).optional())
    .default(50),
});

export const TeamNewsRecentResponseSchema = z.object({
  generatedAt: z.string(),
  // Echo of the resolved watermark window actually applied (after defaults).
  since: z.string().nullable(),
  until: z.string(),
  items: z.array(TeamNewsItemSchema),
});

export type NewsEventType = z.infer<typeof NewsEventTypeSchema>;
export type NewsDiscoveryOutcome = z.infer<typeof NewsDiscoveryOutcomeSchema>;
export type TeamNewsItemDto = z.infer<typeof TeamNewsItemSchema>;
export type TeamNewsListResponse = z.infer<typeof TeamNewsListResponseSchema>;
export type TeamNewsGroupedResponse = z.infer<typeof TeamNewsGroupedResponseSchema>;
export type TeamNewsFiltersResponse = z.infer<typeof TeamNewsFiltersResponseSchema>;
export type TeamNewsIngestItem = z.infer<typeof TeamNewsIngestItemSchema>;
export type IngestTeamNewsDto = z.infer<typeof IngestTeamNewsDtoSchema>;
export type IngestTeamNewsResponse = z.infer<typeof IngestTeamNewsResponseSchema>;
export type UpdateTeamNewsEnrichmentDto = z.infer<typeof UpdateTeamNewsEnrichmentDtoSchema>;
export type BatchUpdateTeamNewsEnrichmentDto = z.infer<typeof BatchUpdateTeamNewsEnrichmentDtoSchema>;
export type BatchUpdateTeamNewsEnrichmentResponse = z.infer<typeof BatchUpdateTeamNewsEnrichmentResponseSchema>;
export type TeamNewsEnrichmentResponseItem = z.infer<typeof TeamNewsEnrichmentSchema>;
export type TeamWithNewsEnrichment = z.infer<typeof TeamWithNewsEnrichmentSchema>;
export type TeamsWithNewsEnrichmentResponse = z.infer<typeof TeamsWithNewsEnrichmentResponseSchema>;
export type TeamNewsPerTeamResponse = z.infer<typeof TeamNewsPerTeamResponseSchema>;
export type TeamNewsByTeamQuery = z.infer<typeof TeamNewsByTeamQueryParams>;
export type TeamNewsByTeamResponse = z.infer<typeof TeamNewsByTeamResponseSchema>;
export type TeamNewsRecentQuery = z.infer<typeof TeamNewsRecentQueryParams>;
export type TeamNewsRecentResponse = z.infer<typeof TeamNewsRecentResponseSchema>;
export type TeamNewsDiscussion = z.infer<typeof TeamNewsDiscussionSchema>;
export type CreateTeamNewsDiscussionRequest = z.infer<typeof CreateTeamNewsDiscussionRequestSchema>;
export type CreateTeamNewsDiscussionResponse = z.infer<typeof CreateTeamNewsDiscussionResponseSchema>;
export type TeamNewsForumLinkDto = z.infer<typeof TeamNewsForumLinkSchema>;
