import { z } from 'zod';

// ── Feed comments (Feed News only)
export const FeedCommentAuthorSchema = z.object({
  uid: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export interface FeedComment {
  uid: string;
  newsItemUid: string;
  parentUid: string | null;
  text: string;
  author: FeedCommentAuthor;
  createdAt: string;
  isOwn: boolean;
  replies: FeedComment[];
}

const baseFeedCommentSchema = z.object({
  uid: z.string(),
  newsItemUid: z.string(),
  parentUid: z.string().nullable(),
  text: z.string(),
  author: FeedCommentAuthorSchema,
  createdAt: z.string(),
  isOwn: z.boolean(),
});

// Only the self-referential field is wrapped in z.lazy() — wrapping the whole
// object (as z.lazy(() => z.object({...})) would) makes replies' element type
// resolve before FeedCommentSchema finishes initializing, so TS infers it as
// a wide, all-optional shape instead of FeedComment.
export const FeedCommentSchema: z.ZodType<FeedComment> = baseFeedCommentSchema.extend({
  replies: z.lazy(() => FeedCommentSchema.array()),
});

export const FeedCommentsQueryParams = z.object({
  newsItemUid: z.string().min(1),
});

export const FeedCommentsResponseSchema = z.object({
  items: z.array(FeedCommentSchema),
});

export const CreateFeedCommentRequestSchema = z.object({
  newsItemUid: z.string().min(1),
  parentUid: z.string().min(1).optional(),
  text: z.string().trim().min(1).max(2000),
});

export const FeedCommentCountsRequestSchema = z.object({
  uids: z.array(z.string()).min(1).max(200),
});

// Keyed by news item uid; a uid absent from `counts` implies 0. Counts
// include replies (every row under a news item, at any depth).
export const FeedCommentCountsResponseSchema = z.object({
  counts: z.record(z.string(), z.number().int().min(0)),
});

export const DeleteFeedCommentResponseSchema = z.object({
  uid: z.string(),
  deleted: z.boolean(),
});

// ── Feed news likes
export const FeedNewsLikeStatusSchema = z.object({
  likeCount: z.number().int().min(0),
  viewerHasLiked: z.boolean(),
});

export type FeedCommentAuthor = z.infer<typeof FeedCommentAuthorSchema>;
export type FeedCommentsQuery = z.infer<typeof FeedCommentsQueryParams>;
export type FeedCommentsResponse = z.infer<typeof FeedCommentsResponseSchema>;
export type CreateFeedCommentRequest = z.infer<typeof CreateFeedCommentRequestSchema>;
export type FeedCommentCountsRequest = z.infer<typeof FeedCommentCountsRequestSchema>;
export type FeedCommentCountsResponse = z.infer<typeof FeedCommentCountsResponseSchema>;
export type DeleteFeedCommentResponse = z.infer<typeof DeleteFeedCommentResponseSchema>;
export type FeedNewsLikeStatus = z.infer<typeof FeedNewsLikeStatusSchema>;
