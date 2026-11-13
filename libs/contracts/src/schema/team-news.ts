import { z } from 'zod';

export const NewsEventTypeSchema = z.enum(['FUNDING', 'LAUNCH', 'PARTNERSHIP', 'ANNOUNCEMENT', 'MILESTONE', 'OTHER']);

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
  contentHtml: z.string().nullable(),
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
  // Aggregate "I'm interested" upvotes. Always present (0 when none).
  upvoteCount: z.number().int().min(0),
  // True when the authenticated caller has upvoted this item. Always false
  // for anonymous requests.
  viewerHasUpvoted: z.boolean(),
  // 1 = Top Stories lead, 2–5 = runners-up; null when not featured.
  // Set by seed-trending; independent of upvoteCount.
  editorialRank: z.number().int().min(1).max(5).nullable(),
  // Raw feed-card impression count. Not deduplicated by user, session, or
  // repeat viewing, and includes anonymous visitors. Incremented via
  // POST /v1/team-news/impressions.
  viewCount: z.number().int().min(0),
  // True when posted from the team profile by a member or directory admin.
  isTeamPosted: z.boolean(),
  // Absolute https og:image / twitter:image of the source page, captured when
  // the item is created. Null when the page has none or was not checked yet.
  imageUrl: z.string().nullable(),
});

export const CreateTeamNewsPostRequestSchema = z.object({
  title: z.string().trim().min(1).max(150),
  body: z.string().optional(),
  url: z.string().trim().min(1),
});

export const TeamNewsPostConflictSchema = z.object({
  message: z.string(),
  existingTitle: z.string(),
  existingEventDate: z.string(),
});

export const TeamNewsUpvoteStatusSchema = z.object({
  upvoteCount: z.number().int().min(0),
  viewerHasUpvoted: z.boolean(),
});

export const TeamNewsFollowSuggestionSchema = z.object({
  uid: z.string(),
  name: z.string(),
  logo: z.string().nullable(),
  shortDescription: z.string().nullable(),
  // Display string, e.g. "Storage · 1.2k followers"
  reason: z.string(),
});

export const TeamNewsFollowSuggestionsQueryParams = z.object({
  limit: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(20))
    .optional()
    .default(10),
});

export const TeamNewsFollowSuggestionsResponseSchema = z.object({
  items: z.array(TeamNewsFollowSuggestionSchema),
});

export const TeamNewsPopularQueryParams = z.object({
  limit: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(20))
    .optional()
    .default(7),
});

export const SeedTeamNewsTrendingDtoSchema = z.object({
  createdAfter: z.string(),
  // Synthetic-like count for Popular this week (fixed at 5).
  limit: z.number().int().min(5).max(5).optional().default(5),
});

export const SeedTeamNewsTrendingRankedItemSchema = z.object({
  uid: z.string(),
  rank: z.number().int().min(1),
  upvoteCount: z.number().int().min(0),
});

export const SeedTeamNewsTrendingEditorialItemSchema = z.object({
  uid: z.string(),
  rank: z.number().int().min(1).max(5),
});

export const SeedTeamNewsTrendingResponseSchema = z.object({
  ranked: z.array(SeedTeamNewsTrendingRankedItemSchema),
  editorial: z.array(SeedTeamNewsTrendingEditorialItemSchema),
  protocolLabsIncluded: z.boolean(),
  candidateCount: z.number().int().min(0),
});

export const TeamNewsPopularItemSchema = z.object({
  uid: z.string(),
  title: z.string(),
  teamUid: z.string(),
  teamName: z.string(),
  sourceUrl: z.string(),
  upvoteCount: z.number().int().min(0),
});

export const TeamNewsPopularResponseSchema = z.object({
  items: z.array(TeamNewsPopularItemSchema),
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

// POST /v1/team-news/impressions — records feed-card impressions for a batch
// of news items. Unauthenticated; every occurrence of a uid in the array
// increments that item's viewCount by 1 (no dedup). Unknown uids are ignored.
// Batch size capped at 200, matching POST /v1/feed/comments/counts.
export const RecordTeamNewsImpressionsRequestSchema = z.object({
  newsItemUids: z.array(z.string()).min(1).max(200),
});

export const RecordTeamNewsImpressionsResponseSchema = z.object({
  success: z.literal(true),
});

// POST /v1/team-news/counts — how many news items each of these teams published
// in the last TEAM_NEWS_COUNT_WINDOW_DAYS. Unauthenticated: the number is the
// same for every viewer, signed-in or not. Powers the "N new posts" chip on the
// teams grid and the job board. Batch size capped at 200, matching
// POST /v1/feed/comments/counts.
export const TeamNewsCountsRequestSchema = z.object({
  teamUids: z.array(z.string()).min(1).max(200),
});

// Keyed by team uid. A uid ABSENT from `counts` means zero — groupBy returns no
// row for a team with nothing recent, and zero-filling would cost a second query
// to tell "published nothing" from "not a team". Both render the same: no chip.
export const TeamNewsCountsResponseSchema = z.object({
  counts: z.record(z.string(), z.number().int().min(0)),
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
  /** News from teams with no focus-area group; home "All" tab only. */
  allTabExtraItems: z.array(TeamNewsItemSchema).default([]),
  /** Memberships ∪ follows ∪ Teams-to-follow matches; empty for anonymous. */
  forYouTeamUids: z.array(z.string()).default([]),
  // LAB-2999: For You by news tags. The member's tags (focus-area slugs, parents
  // expanded to children) and the teams they belong to or follow; [] signed out.
  forYouTags: z.array(z.string()).default([]),
  forYouOwnTeamUids: z.array(z.string()).default([]),
  /** Categories the viewer picked on News preferences (LAB-3140). [] signed out or never saved. */
  forYouCategories: z.array(NewsEventTypeSchema).default([]),
});

export const TeamNewsFacetItemSchema = z.object({
  value: z.string(),
  count: z.number().int(),
});

export const TeamNewsFiltersResponseSchema = z.object({
  eventType: z.array(TeamNewsFacetItemSchema),
  focus: z.array(TeamNewsFacetItemSchema),
});

/** A news tag a member can choose: a focus area, by its slug (LAB-2998). */
export const TeamNewsTagSchema = z.object({
  slug: z.string(),
  title: z.string(),
});

/** A top-level focus area with the second-level ones news used under it. */
export const TeamNewsTagGroupSchema = TeamNewsTagSchema.extend({
  children: z.array(TeamNewsTagSchema),
});

export const TeamNewsTagsResponseSchema = z.array(TeamNewsTagGroupSchema);

// Service ingest. The producer (e.g. pln-data-enrichment) is responsible for
// noise filtering, classification, and source-URL liveness checks before
// posting here. The directory just persists what it's told, idempotently.
export const TeamNewsIngestItemSchema = z.object({
  teamUid: z.string(),
  eventDate: z.string(),
  title: z.string().min(1),
  summary: z.string().optional(),
  contentHtml: z.string().nullable().optional(),
  sourceUrl: z.string().min(1),
  sourceUrls: z.array(z.string().min(1)).optional(),
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
    .preprocess(
      (v) => (v === undefined || v === '' ? undefined : Number(v)),
      z.number().int().min(1).max(100).optional()
    )
    .default(50),
});

export const TeamNewsRecentResponseSchema = z.object({
  generatedAt: z.string(),
  // Echo of the resolved watermark window actually applied (after defaults).
  since: z.string().nullable(),
  until: z.string(),
  items: z.array(TeamNewsItemSchema),
});

// POST /v1/team-news/digest-picks — per-member For You ranking over the same
// watermark window as GET /recent. Service-auth only (notification digest job).
// Empty For You for a member falls back to the global newest `limit` items.
export const TeamNewsDigestPicksRequestSchema = z.object({
  memberUids: z.array(z.string()).min(1).max(200),
  sinceCreatedAt: z.string().optional(),
  untilCreatedAt: z.string().optional(),
  limit: z.number().int().min(1).max(4).optional().default(3),
  // The forum digest job reports which frequency is about to send, and the lead
  // that frequency already showed. Older callers omit both.
  frequency: z.enum(['daily', 'weekly']).optional(),
  lastShownLeadUid: z.string().nullable().optional(),
});

export const LabosDigestPickSourceSchema = z.enum(['admin', 'ai']);

export const TeamNewsDigestPicksResponseSchema = z.object({
  generatedAt: z.string(),
  since: z.string(),
  until: z.string(),
  windowCount: z.number().int().min(0),
  picks: z.record(z.string(), z.array(TeamNewsItemSchema)),
  // Lead shown as the digest's "Top story" card. The first admin pick when an
  // override is set, otherwise editorial rank 1. Null when there is none.
  topStory: TeamNewsItemSchema.nullable(),
  topStorySource: LabosDigestPickSourceSchema,
  // Ordered Top stories (up to 5). The email highlights the first. The other four cards are the member's picks, filled from these stories when the member has fewer than four.
  topStories: z.array(TeamNewsItemSchema),
  // Set when topStorySource is admin. A digest send deletes the override only
  // when this value still matches the row.
  overrideUpdatedAt: z.string().nullable(),
});

// GET /v1/team-news/latest — ingestion time of the newest news item the public
// feed would show, and nothing else. Powers the "new news" dot on the app
// header's Home button: the client compares this against the last time it
// recorded a /home visit.
//
// Deliberately NOT TeamNewsRecentResponseSchema. The header renders on every
// page in the app, so this is requested on effectively every page load by every
// user, and shipping a full TeamNewsItem (contentHtml included) to answer
// "anything new?" would be absurd at that call volume.
//
// `null` = no visible news item exists at all, which the client must treat as
// "nothing new" rather than "everything is new".
export const TeamNewsLatestResponseSchema = z.object({
  latestAt: z.string().nullable(),
});

export type NewsEventType = z.infer<typeof NewsEventTypeSchema>;
export type NewsDiscoveryOutcome = z.infer<typeof NewsDiscoveryOutcomeSchema>;
export type TeamNewsItemDto = z.infer<typeof TeamNewsItemSchema>;
export type TeamNewsListResponse = z.infer<typeof TeamNewsListResponseSchema>;
export type TeamNewsGroupedResponse = z.infer<typeof TeamNewsGroupedResponseSchema>;
export type TeamNewsFiltersResponse = z.infer<typeof TeamNewsFiltersResponseSchema>;
export type TeamNewsTagsResponse = z.infer<typeof TeamNewsTagsResponseSchema>;
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
export type TeamNewsDigestPicksRequest = z.infer<typeof TeamNewsDigestPicksRequestSchema>;
export type TeamNewsDigestPicksResponse = z.infer<typeof TeamNewsDigestPicksResponseSchema>;

export const LabosDigestFrequencySchema = z.enum(['daily', 'weekly']);

const PageParam = z
  .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1))
  .optional()
  .default(1);

const LimitParam = z
  .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100))
  .optional()
  .default(50);

export const LabosDigestStorySchema = z.object({
  position: z.number().int().min(1),
  source: LabosDigestPickSourceSchema,
  uid: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  sourceDomain: z.string().nullable(),
  sourceUrl: z.string(),
  eventDate: z.string(),
  tags: z.array(z.string()),
  teamUid: z.string(),
  teamName: z.string(),
});

export const LabosDigestFrequencyPreviewSchema = z.object({
  frequency: LabosDigestFrequencySchema,
  leadIncluded: z.boolean(),
  leadUid: z.string().nullable(),
  lastLeadNewsItemUid: z.string().nullable(),
});

export const LabosDigestViewSchema = z.object({
  source: LabosDigestPickSourceSchema,
  stories: z.array(LabosDigestStorySchema),
  daily: LabosDigestFrequencyPreviewSchema,
  weekly: LabosDigestFrequencyPreviewSchema,
  overrideUpdatedAt: z.string().nullable(),
});

export const SaveLabosDigestPicksSchema = z.object({
  newsItemUids: z.array(z.string().min(1)).min(1).max(5),
});

export const LabosDigestNewsQuerySchema = z.object({
  page: PageParam,
  limit: LimitParam,
  from: z.string().optional(),
  to: z.string().optional(),
  tags: ListParam,
  q: z.string().optional(),
});

export const LabosDigestTopStoryHistorySchema = z.object({
  frequency: LabosDigestFrequencySchema,
  sentAt: z.string(),
  position: z.number().int().min(1),
  isLead: z.boolean(),
});

export const LabosDigestFoundNewsSchema = z.object({
  uid: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  source: z.string().nullable(),
  date: z.string(),
  tags: z.array(z.string()),
  wasTopStory: z.boolean(),
  topStoryHistory: z.array(LabosDigestTopStoryHistorySchema),
});

export const LabosDigestNewsDetailSchema = z.object({
  uid: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  contentHtml: z.string().nullable(),
  sourceUrl: z.string(),
  sourceUrls: z.array(z.string()),
  sourceDomain: z.string().nullable(),
  imageUrl: z.string().nullable(),
  eventDate: z.string(),
  tags: z.array(z.string()),
  team: z.object({
    uid: z.string(),
    name: z.string(),
  }),
  topStoryHistory: z.array(LabosDigestTopStoryHistorySchema),
});

export const UpdateLabosDigestNewsSchema = z.object({
  title: z.string().trim().min(1).max(500),
  summary: z.string().trim().max(8000),
  sourceUrls: z.array(z.string().trim().min(1)).min(1).max(20),
});

export const PostLabosDigestNewsSchema = z.object({
  teamUid: z.string().trim().min(1),
  title: z.string().trim().min(1).max(150),
  body: z.string().optional(),
  url: z.string().trim().min(1),
});

export const LabosDigestFoundNewsResponseSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(LabosDigestFoundNewsSchema),
});

export const LabosDigestServiceNewsSchema = z.object({
  uid: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  source: z.string().nullable(),
  link: z.string(),
  date: z.string(),
  tags: z.array(z.string()),
  team: z.object({
    uid: z.string(),
    name: z.string(),
  }),
});

export const LabosDigestServiceNewsResponseSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(LabosDigestServiceNewsSchema),
});

export const LabosDigestSendSchema = z.object({
  uid: z.string(),
  frequency: LabosDigestFrequencySchema,
  sentAt: z.string(),
  source: LabosDigestPickSourceSchema,
  channel: z.string(),
  stories: z.array(LabosDigestStorySchema),
});

export const LabosDigestSendListSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(LabosDigestSendSchema),
});

export const LabosDigestSendsQuerySchema = z.object({
  page: PageParam,
  limit: LimitParam,
  frequency: LabosDigestFrequencySchema.optional(),
});

export const RecordLabosDigestSendSchema = z.object({
  frequency: LabosDigestFrequencySchema,
  sentAt: z.string(),
  source: LabosDigestPickSourceSchema,
  leadNewsItemUid: z.string().nullable(),
  lastShownLeadUid: z.string().nullable(),
  storyUids: z.array(z.string()).max(5),
  overrideUpdatedAt: z.string().nullable(),
});

export const RecordLabosDigestSendResponseSchema = z.object({
  uid: z.string(),
  clearedOverride: z.boolean(),
});

export type LabosDigestView = z.infer<typeof LabosDigestViewSchema>;
export type LabosDigestStory = z.infer<typeof LabosDigestStorySchema>;
export type SaveLabosDigestPicks = z.infer<typeof SaveLabosDigestPicksSchema>;
export type LabosDigestNewsQuery = z.infer<typeof LabosDigestNewsQuerySchema>;
export type LabosDigestFoundNewsResponse = z.infer<typeof LabosDigestFoundNewsResponseSchema>;
export type LabosDigestNewsDetail = z.infer<typeof LabosDigestNewsDetailSchema>;
export type UpdateLabosDigestNews = z.infer<typeof UpdateLabosDigestNewsSchema>;
export type PostLabosDigestNews = z.infer<typeof PostLabosDigestNewsSchema>;
export type LabosDigestServiceNewsResponse = z.infer<typeof LabosDigestServiceNewsResponseSchema>;
export type LabosDigestSendList = z.infer<typeof LabosDigestSendListSchema>;
export type LabosDigestSendsQuery = z.infer<typeof LabosDigestSendsQuerySchema>;
export type RecordLabosDigestSend = z.infer<typeof RecordLabosDigestSendSchema>;
export type RecordLabosDigestSendResponse = z.infer<typeof RecordLabosDigestSendResponseSchema>;
export type LabosDigestFrequency = z.infer<typeof LabosDigestFrequencySchema>;
export type LabosDigestPickSource = z.infer<typeof LabosDigestPickSourceSchema>;
export type TeamNewsLatestResponse = z.infer<typeof TeamNewsLatestResponseSchema>;
export type TeamNewsDiscussion = z.infer<typeof TeamNewsDiscussionSchema>;
export type CreateTeamNewsDiscussionRequest = z.infer<typeof CreateTeamNewsDiscussionRequestSchema>;
export type CreateTeamNewsDiscussionResponse = z.infer<typeof CreateTeamNewsDiscussionResponseSchema>;
export type TeamNewsForumLinkDto = z.infer<typeof TeamNewsForumLinkSchema>;
export type TeamNewsUpvoteStatus = z.infer<typeof TeamNewsUpvoteStatusSchema>;
export type TeamNewsFollowSuggestion = z.infer<typeof TeamNewsFollowSuggestionSchema>;
export type TeamNewsFollowSuggestionsQuery = z.infer<typeof TeamNewsFollowSuggestionsQueryParams>;
export type TeamNewsFollowSuggestionsResponse = z.infer<typeof TeamNewsFollowSuggestionsResponseSchema>;
export type TeamNewsPopularQuery = z.infer<typeof TeamNewsPopularQueryParams>;
export type TeamNewsPopularItem = z.infer<typeof TeamNewsPopularItemSchema>;
export type TeamNewsPopularResponse = z.infer<typeof TeamNewsPopularResponseSchema>;
export type TeamNewsCountsRequest = z.infer<typeof TeamNewsCountsRequestSchema>;
export type TeamNewsCountsResponse = z.infer<typeof TeamNewsCountsResponseSchema>;
export type CreateTeamNewsPostRequest = z.infer<typeof CreateTeamNewsPostRequestSchema>;
export type SeedTeamNewsTrendingDto = z.infer<typeof SeedTeamNewsTrendingDtoSchema>;
export type SeedTeamNewsTrendingResponse = z.infer<typeof SeedTeamNewsTrendingResponseSchema>;
