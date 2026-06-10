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
  objectiveUid: z.string().optional(),
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
  objective: RoadmapObjectiveRefSchema.nullable(),
  upvoteCount: z.number().int(),
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

export const RoadmapUpvoteSchema = z.object({
  note: z.string().max(500).optional().nullable(),
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

export const RoadmapItemUpvotersResponseSchema = z.object({
  total: z.number().int(),
  upvotes: z.array(
    z.object({
      uid: z.string(),
      note: z.string().nullable(),
      createdAt: z.string(),
      member: RoadmapMemberSummarySchema,
    })
  ),
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

export const SetRoadmapItemObjectiveSchema = z
  .object({
    /** Existing objective uid, or null to clear the chip. */
    objectiveUid: z.string().optional().nullable(),
    /** Find-or-create an objective by title and assign it. */
    title: z.string().trim().min(1).max(150).optional(),
  })
  .refine((v) => v.objectiveUid !== undefined || v.title !== undefined, {
    message: 'Provide objectiveUid or title',
  });

// --- Priority signaling: settings ---

export const RoadmapSettingsSchema = z.object({
  pinLimit: z.number().int(),
});

export const UpdateRoadmapSettingsSchema = z.object({
  pinLimit: z.number().int().min(0).max(100),
});
