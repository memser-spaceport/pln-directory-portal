import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  CreateFeedCommentRequestSchema,
  DeleteFeedCommentResponseSchema,
  FeedCommentCountsRequestSchema,
  FeedCommentCountsResponseSchema,
  FeedCommentSchema,
  FeedCommentsQueryParams,
  FeedCommentsResponseSchema,
  FeedForumPostLikeStatusSchema,
  FeedForumPostsQueryParams,
  FeedForumPostsResponseSchema,
} from '../schema/feed';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiFeed = contract.router({
  getFeedForumPosts: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/feed/forum-posts`,
    query: FeedForumPostsQueryParams,
    responses: {
      200: FeedForumPostsResponseSchema,
    },
    summary: 'Recent forum topics for the newsfeed (empty items for callers without forum access)',
  },
  getFeedCommentCounts: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/feed/comments/counts`,
    body: FeedCommentCountsRequestSchema,
    responses: {
      200: FeedCommentCountsResponseSchema,
    },
    summary: 'Batch comment counts for a list of feed item uids (news items or forum posts)',
  },
  getFeedComments: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/feed/comments`,
    query: FeedCommentsQueryParams,
    responses: {
      200: FeedCommentsResponseSchema,
    },
    summary: 'List comments for one feed item',
  },
  createFeedComment: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/feed/comments`,
    body: CreateFeedCommentRequestSchema,
    responses: {
      201: FeedCommentSchema,
    },
    summary: 'Add a comment to a feed item (any signed-in member)',
  },
  deleteFeedComment: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/feed/comments/:commentUid`,
    pathParams: z.object({ commentUid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: DeleteFeedCommentResponseSchema,
    },
    summary: 'Delete your own feed comment',
  },
  likeFeedForumPost: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/feed/forum-posts/:uid/like`,
    pathParams: z.object({ uid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: FeedForumPostLikeStatusSchema,
    },
    summary: 'Like a forum-post feed item (idempotent)',
  },
  unlikeFeedForumPost: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/feed/forum-posts/:uid/like`,
    pathParams: z.object({ uid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: FeedForumPostLikeStatusSchema,
    },
    summary: 'Unlike a forum-post feed item (idempotent)',
  },
});
