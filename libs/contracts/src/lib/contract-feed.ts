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
  FeedNewsLikeStatusSchema,
} from '../schema/feed';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiFeed = contract.router({
  getFeedCommentCounts: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/feed/comments/counts`,
    body: FeedCommentCountsRequestSchema,
    responses: {
      200: FeedCommentCountsResponseSchema,
    },
    summary: 'Batch comment counts for a list of news item uids (includes replies at any depth)',
  },
  getFeedComments: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/feed/comments`,
    query: FeedCommentsQueryParams,
    responses: {
      200: FeedCommentsResponseSchema,
    },
    summary: 'List comments (threaded, unlimited depth) for one news item',
  },
  createFeedComment: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/feed/comments`,
    body: CreateFeedCommentRequestSchema,
    responses: {
      201: FeedCommentSchema,
    },
    summary: 'Add a comment or reply (via parentUid) to a news item (any signed-in member)',
  },
  deleteFeedComment: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/feed/comments/:commentUid`,
    pathParams: z.object({ commentUid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: DeleteFeedCommentResponseSchema,
    },
    summary: 'Delete your own feed comment (cascades to its replies)',
  },
  likeFeedNewsItem: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/feed/news/:uid/like`,
    pathParams: z.object({ uid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: FeedNewsLikeStatusSchema,
    },
    summary: 'Like a Feed News item (idempotent)',
  },
  unlikeFeedNewsItem: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/feed/news/:uid/like`,
    pathParams: z.object({ uid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: FeedNewsLikeStatusSchema,
    },
    summary: 'Unlike a Feed News item (idempotent)',
  },
});
