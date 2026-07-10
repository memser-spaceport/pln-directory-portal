import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  CreateTeamNewsDiscussionRequestSchema,
  CreateTeamNewsDiscussionResponseSchema,
  TeamNewsByTeamQueryParams,
  TeamNewsByTeamResponseSchema,
  TeamNewsFiltersResponseSchema,
  TeamNewsFollowSuggestionsQueryParams,
  TeamNewsFollowSuggestionsResponseSchema,
  TeamNewsGroupedResponseSchema,
  TeamNewsListQueryParams,
  TeamNewsListResponseSchema,
  TeamNewsPopularQueryParams,
  TeamNewsPopularResponseSchema,
  TeamNewsRecentQueryParams,
  TeamNewsRecentResponseSchema,
  TeamNewsUpvoteStatusSchema,
} from '../schema/team-news';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiTeamNews = contract.router({
  getTeamNews: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/team-news`,
    query: TeamNewsListQueryParams,
    responses: {
      200: TeamNewsListResponseSchema,
    },
    summary: 'List team news items, filtered by focus area / event type / window',
  },
  getTeamNewsGrouped: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/team-news/grouped-by-focus-area`,
    query: TeamNewsListQueryParams,
    responses: {
      200: TeamNewsGroupedResponseSchema,
    },
    summary: 'Team news grouped by top-level focus area for the home feed',
  },
  getTeamNewsFilters: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/team-news/filters`,
    query: TeamNewsListQueryParams,
    responses: {
      200: TeamNewsFiltersResponseSchema,
    },
    summary: 'Facet counts for the Team News list',
  },
  getTeamNewsRecent: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/team-news/recent`,
    query: TeamNewsRecentQueryParams,
    responses: {
      200: TeamNewsRecentResponseSchema,
    },
    summary: 'Recent network news across all teams (for the digest email)',
  },
  // Static paths before :newsItemUid routes so Nest matching stays unambiguous.
  getTeamNewsFollowSuggestions: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/team-news/follow-suggestions`,
    query: TeamNewsFollowSuggestionsQueryParams,
    responses: {
      200: TeamNewsFollowSuggestionsResponseSchema,
    },
    summary: 'Personalized teams-to-follow suggestions for the newsfeed sidebar',
  },
  getTeamNewsPopular: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/team-news/popular`,
    query: TeamNewsPopularQueryParams,
    responses: {
      200: TeamNewsPopularResponseSchema,
    },
    summary: 'Most-upvoted team news from the last 7 days (popular this week rail)',
  },
  getTeamNewsByTeam: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/teams/:teamUid/team-news`,
    pathParams: z.object({ teamUid: z.string() }),
    query: TeamNewsByTeamQueryParams,
    responses: {
      200: TeamNewsByTeamResponseSchema,
    },
    summary: 'List news items for a team, ordered newest first with pagination and search',
  },
  upvoteTeamNews: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/team-news/:newsItemUid/upvote`,
    pathParams: z.object({ newsItemUid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: TeamNewsUpvoteStatusSchema,
    },
    summary: 'Upvote a team news item (idempotent)',
  },
  removeTeamNewsUpvote: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/team-news/:newsItemUid/upvote`,
    pathParams: z.object({ newsItemUid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: TeamNewsUpvoteStatusSchema,
    },
    summary: 'Remove an upvote from a team news item (idempotent)',
  },
  createTeamNewsDiscussion: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/team-news/:newsItemUid/discussions`,
    pathParams: z.object({ newsItemUid: z.string() }),
    body: CreateTeamNewsDiscussionRequestSchema,
    responses: {
      201: CreateTeamNewsDiscussionResponseSchema,
    },
    summary: 'Record that a forum topic was created in response to a news item',
  },
});
