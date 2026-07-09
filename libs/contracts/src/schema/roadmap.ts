import { z } from 'zod';

export const RoadmapStageSchema = z.enum(['IDEA', 'BACKLOG', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED']);

/** API converts empty strings to null before validation; store as empty string in DB. */
const roadmapDescriptionCreate = () =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => v ?? '');

const roadmapDescriptionUpdate = () =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ?? ''));

const commaSeparatedListParam = () =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const rawValues = Array.isArray(v) ? v : [v];
      const values = rawValues
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      return values.length > 0 ? values : undefined;
    });

const StageListParam = commaSeparatedListParam();

export const RoadmapSortParam = z.enum(['default', 'trending', 'top_pins', 'newest']);

export const RoadmapItemListQueryParams = z.object({
  stage: StageListParam,
  tags: commaSeparatedListParam(),
  type: z.string().optional(),
  focusArea: z.string().optional(),
  objectiveUid: commaSeparatedListParam(),
  sort: RoadmapSortParam.optional(),
  mine: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  includeDeclined: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  includeArchived: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
});

export const RoadmapMemberSummarySchema = z.object({
  uid: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
});

export const RoadmapObjectiveRefSchema = z.object({
  uid: z.string(),
  title: z.string(),
  order: z.number().int(),
});

export const RoadmapItemPinEntrySchema = z.object({
  uid: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  /** Non-null for historical pins auto-returned on a stage transition. */
  releasedAt: z.string().nullable(),
  member: RoadmapMemberSummarySchema,
});

export const RoadmapItemSchema = z.object({
  uid: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.string().nullable(),
  stage: RoadmapStageSchema,
  focusArea: z.string().nullable(),
  type: z.string().nullable(),
  tags: z.array(z.string()),
  order: z.number(),
  createdByUid: z.string(),
  createdBy: RoadmapMemberSummarySchema,
  promotedAt: z.string().nullable(),
  promotedByUid: z.string().nullable(),
  declinedReason: z.string().nullable(),
  externalTrackerUrl: z.string().nullable(),
  objectives: z.array(RoadmapObjectiveRefSchema),
  /** @deprecated Always 0 — likes removed; use pinCount. Kept for API compat. */
  upvoteCount: z.number().int(),
  /** @deprecated Always false — likes removed; use viewerHasPinned. Kept for API compat. */
  viewerHasUpvoted: z.boolean(),
  /** Active pins while the item is pinnable; frozen total (incl. released) otherwise. */
  pinCount: z.number().int(),
  viewerHasPinned: z.boolean(),
  viewerPinNote: z.string().nullable(),
  /** Pinner identities + notes; only populated for curators, null for everyone else. */
  pins: z.array(RoadmapItemPinEntrySchema).nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RoadmapItemListResponseSchema = z.object({
  items: z.array(RoadmapItemSchema),
  total: z.number().int(),
});

export const CreateRoadmapItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: roadmapDescriptionCreate(),
  acceptanceCriteria: z.string().optional().nullable(),
  focusArea: z.string().max(500).optional().nullable(),
  type: z.string().max(500).optional().nullable(),
  tags: z.array(z.string()).optional(),
  externalTrackerUrl: z.string().max(2000).optional().nullable(),
  stage: RoadmapStageSchema.optional(),
});

export const UpdateRoadmapItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: roadmapDescriptionUpdate(),
  acceptanceCriteria: z.string().optional().nullable(),
  focusArea: z.string().max(500).optional().nullable(),
  type: z.string().max(500).optional().nullable(),
  tags: z.array(z.string()).optional(),
  externalTrackerUrl: z.string().max(2000).optional().nullable(),
  /** Curators only; fractional values are allowed (frontend computes midpoints). */
  order: z.number().optional(),
});

export const ArchiveRoadmapItemSchema = z.object({
  deletionReason: z.string().optional().nullable(),
});

export const DeclineRoadmapItemSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export const TransitionRoadmapItemSchema = z.object({
  stage: RoadmapStageSchema,
});

export const RoadmapBuildButtonClickSchema = z.object({});

// --- Priority signaling: pins ---

export const PinRoadmapItemSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  /** Run-out swap: unpin this item and pin the target atomically (net budget 0). */
  swapItemUid: z.string().optional().nullable(),
});

export const UpdatePinNoteSchema = z.object({
  note: z.string().trim().max(500).nullable(),
});

export const RoadmapPinBalanceSummarySchema = z.object({
  limit: z.number().int(),
  used: z.number().int(),
  remaining: z.number().int(),
});

export const RoadmapPinActionResponseSchema = z.object({
  item: RoadmapItemSchema,
  balance: RoadmapPinBalanceSummarySchema,
});

export const RoadmapMyPinSchema = z.object({
  uid: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  item: z.object({
    uid: z.string(),
    title: z.string(),
    stage: RoadmapStageSchema,
  }),
});

export const RoadmapPinBalanceSchema = RoadmapPinBalanceSummarySchema.extend({
  pins: z.array(RoadmapMyPinSchema),
});

export const RoadmapItemPinnersResponseSchema = z.object({
  total: z.number().int(),
  pins: z.array(RoadmapItemPinEntrySchema),
});

// --- Priority signaling: ordering ---

export const ReorderRoadmapItemsSchema = z.object({
  items: z
    .array(
      z.object({
        uid: z.string().min(1),
        order: z.number(),
      })
    )
    .min(1)
    .max(200),
});

export const ReorderRoadmapItemsResponseSchema = z.object({
  updated: z.number().int(),
});

// --- Priority signaling: objectives ---

export const RoadmapObjectiveSchema = z.object({
  uid: z.string(),
  title: z.string(),
  /** Auto-assigned on creation, unique, ascending; used to sort objective lists/chips. */
  order: z.number().int(),
  itemCount: z.number().int(),
  createdAt: z.string(),
});

export const RoadmapObjectiveListResponseSchema = z.object({
  objectives: z.array(RoadmapObjectiveSchema),
});

export const CreateRoadmapObjectiveSchema = z.object({
  title: z.string().trim().min(1).max(150),
});

/** Replace-all assignment of objectives on an item. Empty objectiveUids clears all. */
export const SetRoadmapItemObjectivesSchema = z.object({
  /** Full desired set of existing objective uids (empty array clears). */
  objectiveUids: z.array(z.string()).default([]),
  /** Find-or-create objectives by title and merge into the assigned set. */
  titles: z.array(z.string().trim().min(1).max(150)).optional(),
});

// --- Priority signaling: settings ---

export const RoadmapSettingsSchema = z.object({
  pinLimit: z.number().int(),
});

export const UpdateRoadmapSettingsSchema = z.object({
  pinLimit: z.number().int().min(0).max(100),
});

// --- Submission drafts ---

/** Which form the member was filling in: a member idea or a curator roadmap card. */
export const RoadmapDraftVariantSchema = z.enum(['idea', 'roadmap']);

/**
 * Server-persisted snapshot of an in-progress create/submit form. Every payload field
 * is nullable — this is partial, unsaved form state, not a validated item.
 */
export const RoadmapSubmissionDraftSchema = z.object({
  uid: z.string(),
  variant: RoadmapDraftVariantSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  type: z.string().nullable(),
  stage: RoadmapStageSchema.nullable(),
  objectiveUids: z.array(z.string()),
  newObjectiveTitle: z.string().nullable(),
  showCreateObjective: z.boolean(),
  updatedAt: z.string(),
});

/** GET response: the member's single draft, or null when none has been saved. */
export const RoadmapDraftResponseSchema = z.object({
  draft: RoadmapSubmissionDraftSchema.nullable(),
});

/**
 * Full-replace upsert body for the debounced autosave. Omitted fields fall back to
 * their empty defaults (PUT semantics — the UI sends the whole form each save).
 */
export const UpsertRoadmapDraftSchema = z.object({
  variant: RoadmapDraftVariantSchema.optional(),
  title: z.string().max(500).optional().nullable(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  type: z.string().max(500).optional().nullable(),
  stage: RoadmapStageSchema.optional().nullable(),
  objectiveUids: z.array(z.string()).optional(),
  newObjectiveTitle: z.string().max(150).optional().nullable(),
  showCreateObjective: z.boolean().optional(),
});

export const DeleteRoadmapDraftResponseSchema = z.object({
  deleted: z.boolean(),
});
