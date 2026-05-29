import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  ArchiveRoadmapItemSchema,
  CreateRoadmapItemSchema,
  DeclineRoadmapItemSchema,
  RoadmapBuildButtonClickSchema,
  RoadmapItemListQueryParams,
  RoadmapItemListResponseSchema,
  RoadmapItemSchema,
  RoadmapUpvoteSchema,
  TransitionRoadmapItemSchema,
  UpdateRoadmapItemSchema,
} from '../schema/roadmap';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

const itemPathParams = z.object({ uid: z.string() });

export const apiRoadmap = contract.router({
  listRoadmapItems: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/roadmap/items`,
    query: RoadmapItemListQueryParams,
    responses: {
      200: RoadmapItemListResponseSchema,
    },
    summary: 'List roadmap items (ideas and roadmap cards)',
  },
  getRoadmapItem: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid`,
    pathParams: itemPathParams,
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Get a single roadmap item',
  },
  createRoadmapItem: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/items`,
    body: CreateRoadmapItemSchema,
    responses: {
      201: RoadmapItemSchema,
    },
    summary: 'Create an idea or roadmap item',
  },
  updateRoadmapItem: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid`,
    pathParams: itemPathParams,
    body: UpdateRoadmapItemSchema,
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Update roadmap item fields (not stage)',
  },
  archiveRoadmapItem: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid`,
    pathParams: itemPathParams,
    body: ArchiveRoadmapItemSchema,
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Soft-delete a roadmap item',
  },
  promoteRoadmapItem: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/promote`,
    pathParams: itemPathParams,
    body: z.object({}),
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Promote an idea to PLANNED',
  },
  declineRoadmapItem: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/decline`,
    pathParams: itemPathParams,
    body: DeclineRoadmapItemSchema,
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Decline an idea with a reason',
  },
  transitionRoadmapItem: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/transition`,
    pathParams: itemPathParams,
    body: TransitionRoadmapItemSchema,
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Change item stage (kanban move, under review, etc.)',
  },
  addRoadmapUpvote: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/upvote`,
    pathParams: itemPathParams,
    body: RoadmapUpvoteSchema,
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Add or update upvote on an item',
  },
  removeRoadmapUpvote: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/upvote`,
    pathParams: itemPathParams,
    body: z.object({}),
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Remove current member upvote',
  },
  trackBuildButtonClick: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/build-button-click`,
    pathParams: itemPathParams,
    body: RoadmapBuildButtonClickSchema,
    responses: {
      204: z.object({}),
    },
    summary: 'Track click on disabled build-with-agents button',
  },
});
