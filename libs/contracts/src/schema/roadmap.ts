import { z } from 'zod';

export const RoadmapStageSchema = z.enum([
  'IDEA',
  'UNDER_REVIEW',
  'PLANNED',
  'IN_PROGRESS',
  'SHIPPED',
  'DECLINED',
]);

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

export const DESCRIPTION_MAX_LENGTH = 1000;

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

const withinDescriptionLimit = (value: string) => stripHtml(value).length <= DESCRIPTION_MAX_LENGTH;
const descriptionLimitMessage = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`;

export const RoadmapItemListQueryParams = z.object({
  stage: StageListParam,
  focusArea: z.string().optional(),
  mine: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .optional(),
  includeDeclined: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .optional(),
  includeArchived: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .optional(),
});

export const RoadmapMemberSummarySchema = z.object({
  uid: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
});

export const RoadmapItemSchema = z.object({
  uid: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.string().nullable(),
  stage: RoadmapStageSchema,
  focusArea: z.string().nullable(),
  createdByUid: z.string(),
  createdBy: RoadmapMemberSummarySchema,
  promotedAt: z.string().nullable(),
  promotedByUid: z.string().nullable(),
  declinedReason: z.string().nullable(),
  externalTrackerUrl: z.string().nullable(),
  upvoteCount: z.number().int(),
  viewerHasUpvoted: z.boolean(),
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
  description: z.string().refine(withinDescriptionLimit, descriptionLimitMessage).optional().default(''),
  acceptanceCriteria: z.string().optional().nullable(),
  focusArea: z.string().max(500).optional().nullable(),
  externalTrackerUrl: z.string().max(2000).optional().nullable(),
  stage: RoadmapStageSchema.optional(),
});

export const UpdateRoadmapItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().refine(withinDescriptionLimit, descriptionLimitMessage).optional(),
  acceptanceCriteria: z.string().optional().nullable(),
  focusArea: z.string().max(500).optional().nullable(),
  externalTrackerUrl: z.string().max(2000).optional().nullable(),
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
