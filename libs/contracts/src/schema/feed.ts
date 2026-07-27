import { z } from 'zod';

// ── Forum posts ──────────────────────────────────────────────────────────
// Forum topics surfaced in the newsfeed. Sourced live from NodeBB (never
// stored locally); only forum-access callers receive non-empty items.

export const FeedForumPostAuthorSchema = z.object({
  memberUid: z.string().nullable(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string().nullable(),
});

export const FeedForumPostSchema = z.object({
  uid: z.string(),
  title: z.string(),
  body: z.string(),
  author: FeedForumPostAuthorSchema,
  focusAreas: z.array(z.string()),
  category: z.string(),
  createdAt: z.string(),
  forumTopicUrl: z.string().nullable(),
  commentCount: z.number().int().min(0),
  likeCount: z.number().int().min(0),
  viewerHasLiked: z.boolean(),
});

export const FeedForumPostsResponseSchema = z.object({
  items: z.array(FeedForumPostSchema),
});

export const FeedForumPostsQueryParams = z.object({
  limit: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100))
    .optional()
    .default(20),
  page: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(0))
    .optional()
    .default(0),
});

// ── Feed comments (span both news items and forum posts) ────────────────
// Comments are feed-only — never synced to NodeBB, even for forum posts.

export const FeedCommentAuthorSchema = z.object({
  uid: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const FeedCommentSchema = z.object({
  uid: z.string(),
  itemUid: z.string(),
  text: z.string(),
  author: FeedCommentAuthorSchema,
  createdAt: z.string(),
  isOwn: z.boolean(),
});

export const FeedCommentsQueryParams = z.object({
  itemUid: z.string().min(1),
});

export const FeedCommentsResponseSchema = z.object({
  items: z.array(FeedCommentSchema),
});

export const CreateFeedCommentRequestSchema = z.object({
  itemUid: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
});

export const FeedCommentCountsRequestSchema = z.object({
  uids: z.array(z.string()).min(1).max(200),
});

// Keyed by item uid; a uid absent from `counts` implies 0.
export const FeedCommentCountsResponseSchema = z.object({
  counts: z.record(z.string(), z.number().int().min(0)),
});

export const DeleteFeedCommentResponseSchema = z.object({
  uid: z.string(),
  deleted: z.boolean(),
});

// ── Forum post likes (directory-portal-native, not a NodeBB vote proxy) ──

export const FeedForumPostLikeStatusSchema = z.object({
  likeCount: z.number().int().min(0),
  viewerHasLiked: z.boolean(),
});

export type FeedForumPostAuthor = z.infer<typeof FeedForumPostAuthorSchema>;
export type FeedForumPost = z.infer<typeof FeedForumPostSchema>;
export type FeedForumPostsResponse = z.infer<typeof FeedForumPostsResponseSchema>;
export type FeedForumPostsQuery = z.infer<typeof FeedForumPostsQueryParams>;
export type FeedCommentAuthor = z.infer<typeof FeedCommentAuthorSchema>;
export type FeedComment = z.infer<typeof FeedCommentSchema>;
export type FeedCommentsQuery = z.infer<typeof FeedCommentsQueryParams>;
export type FeedCommentsResponse = z.infer<typeof FeedCommentsResponseSchema>;
export type CreateFeedCommentRequest = z.infer<typeof CreateFeedCommentRequestSchema>;
export type FeedCommentCountsRequest = z.infer<typeof FeedCommentCountsRequestSchema>;
export type FeedCommentCountsResponse = z.infer<typeof FeedCommentCountsResponseSchema>;
export type DeleteFeedCommentResponse = z.infer<typeof DeleteFeedCommentResponseSchema>;
export type FeedForumPostLikeStatus = z.infer<typeof FeedForumPostLikeStatusSchema>;
