import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  CreateTeamNewsDiscussionRequestSchema,
  CreateTeamNewsDiscussionResponseSchema,
  TeamNewsFiltersResponseSchema,
  TeamNewsGroupedResponseSchema,
  TeamNewsListQueryParams,
  TeamNewsListResponseSchema,
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
