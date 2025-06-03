import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

const GenerateRecommendationsSchema = z.object({
  memberUid: z.string(),
  recommendationId: z.string().optional(),
});

export class GenerateRecommendationsDto extends createZodDto(GenerateRecommendationsSchema) {}

export const RecommendationRunStatusSchema = z.enum(['OPEN', 'CLOSED', 'SENT']);
export type RecommendationRunStatus = z.infer<typeof RecommendationRunStatusSchema>;

export const RecommendationSchema = z.object({
  uid: z.string(),
  recommendedMemberUid: z.string(),
  score: z.number(),
  factors: z.record(z.any()),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const RecommendationRunSchema = z.object({
  uid: z.string(),
  targetMemberUid: z.string(),
  status: RecommendationRunStatusSchema,
  recommendations: z.array(RecommendationSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateRecommendationRunRequestSchema = z.object({
  targetMemberUid: z.string(),
});

export const GenerateMoreRecommendationsRequestSchema = z.object({
  approvedRecommendationUids: z.array(z.string()),
  rejectedRecommendationUids: z.array(z.string()),
});

export const UpdateRecommendationRunStatusRequestSchema = z.object({
  status: RecommendationRunStatusSchema,
});

export const SendRecommendationsRequestSchema = z.object({
  approvedRecommendationUids: z.array(z.string()),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type RecommendationRun = z.infer<typeof RecommendationRunSchema>;
export type CreateRecommendationRunRequest = z.infer<typeof CreateRecommendationRunRequestSchema>;
export type GenerateMoreRecommendationsRequest = z.infer<typeof GenerateMoreRecommendationsRequestSchema>;
export type UpdateRecommendationRunStatusRequest = z.infer<typeof UpdateRecommendationRunStatusRequestSchema>;
export type SendRecommendationsRequest = z.infer<typeof SendRecommendationsRequestSchema>;
