import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  ArchiveRoadmapItemSchema,
  CreateRoadmapItemSchema,
  CreateRoadmapObjectiveSchema,
  DeclineRoadmapItemSchema,
  DeleteRoadmapDraftResponseSchema,
  PinRoadmapItemSchema,
  RoadmapDraftResponseSchema,
  ReorderRoadmapItemsResponseSchema,
  ReorderRoadmapItemsSchema,
  RoadmapBuildButtonClickSchema,
  RoadmapItemListQueryParams,
  RoadmapItemListResponseSchema,
  RoadmapItemPinnersResponseSchema,
  RoadmapItemSchema,
  RoadmapObjectiveListResponseSchema,
  RoadmapObjectiveSchema,
  RoadmapPinActionResponseSchema,
  RoadmapPinBalanceSchema,
  RoadmapSettingsSchema,
  SetRoadmapItemObjectiveSchema,
  TransitionRoadmapItemSchema,
  UpdatePinNoteSchema,
  UpdateRoadmapItemSchema,
  UpdateRoadmapSettingsSchema,
  UpsertRoadmapDraftSchema,
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
  reorderRoadmapItems: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/reorder`,
    body: ReorderRoadmapItemsSchema,
    responses: {
      200: ReorderRoadmapItemsResponseSchema,
    },
    summary: 'Bulk-set item order values (curators only)',
  },
  pinRoadmapItem: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/pin`,
    pathParams: itemPathParams,
    body: PinRoadmapItemSchema,
    responses: {
      200: RoadmapPinActionResponseSchema,
    },
    summary: 'Pin an item, spending one pin from the member budget',
  },
  unpinRoadmapItem: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/pin`,
    pathParams: itemPathParams,
    body: z.object({}),
    responses: {
      200: RoadmapPinActionResponseSchema,
    },
    summary: 'Unpin an item, returning the pin to the member budget',
  },
  updateRoadmapPinNote: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/pin`,
    pathParams: itemPathParams,
    body: UpdatePinNoteSchema,
    responses: {
      200: RoadmapPinActionResponseSchema,
    },
    summary: 'Add or update the note on an active pin',
  },
  getMyRoadmapPinBalance: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/roadmap/pins/me`,
    responses: {
      200: RoadmapPinBalanceSchema,
    },
    summary: 'Get current member pin budget and active pins',
  },
  listRoadmapItemPinners: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/pins`,
    pathParams: itemPathParams,
    responses: {
      200: RoadmapItemPinnersResponseSchema,
    },
    summary: 'List members who pinned an item, with notes (curators only)',
  },
  listRoadmapObjectives: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/roadmap/objectives`,
    responses: {
      200: RoadmapObjectiveListResponseSchema,
    },
    summary: 'List roadmap objectives',
  },
  createRoadmapObjective: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/roadmap/objectives`,
    body: CreateRoadmapObjectiveSchema,
    responses: {
      201: RoadmapObjectiveSchema,
    },
    summary: 'Create a roadmap objective (curators only; find-or-create by title)',
  },
  setRoadmapItemObjective: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/roadmap/items/:uid/objective`,
    pathParams: itemPathParams,
    body: SetRoadmapItemObjectiveSchema,
    responses: {
      200: RoadmapItemSchema,
    },
    summary: 'Set, create-and-set, or clear the objective on an item (curators only)',
  },
  getRoadmapSettings: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/roadmap/settings`,
    responses: {
      200: RoadmapSettingsSchema,
    },
    summary: 'Get roadmap settings (pin limit)',
  },
  updateRoadmapSettings: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/roadmap/settings`,
    body: UpdateRoadmapSettingsSchema,
    responses: {
      200: RoadmapSettingsSchema,
    },
    summary: 'Update roadmap settings (curators only)',
  },
  getMyRoadmapDraft: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/roadmap/drafts/me`,
    responses: {
      200: RoadmapDraftResponseSchema,
    },
    summary: "Get the current member's in-progress submission draft (or null)",
  },
  upsertMyRoadmapDraft: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/roadmap/drafts/me`,
    body: UpsertRoadmapDraftSchema,
    responses: {
      200: RoadmapDraftResponseSchema,
    },
    summary: "Create or replace the current member's submission draft (autosave)",
  },
  deleteMyRoadmapDraft: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/roadmap/drafts/me`,
    body: z.object({}),
    responses: {
      200: DeleteRoadmapDraftResponseSchema,
    },
    summary: "Discard the current member's submission draft",
  },
});
