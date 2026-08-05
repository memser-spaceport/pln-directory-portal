import { z } from 'zod';

export const NetworkOverviewStorySchema = z.object({
  headline: z.string().min(1),
  detail: z.string().min(1),
  sourceTag: z.string().min(1),
  newsItemUid: z.string().optional(),
});

export const NetworkOverviewFeaturedSchema = z.object({
  newsItemUid: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  teamName: z.string().nullable(),
});

export const NetworkOverviewDtoSchema = z.object({
  uid: z.string(),
  generatedAt: z.string(),
  windowDays: z.number().int(),
  periodStart: z.string(),
  periodEnd: z.string(),
  featured: NetworkOverviewFeaturedSchema,
  leadParagraph: z.string(),
  topStories: z.array(NetworkOverviewStorySchema),
  generalUpdates: z.array(NetworkOverviewStorySchema),
});

export const GenerateNetworkOverviewDtoSchema = z.object({
  windowDays: z.number().int().min(1).max(365).optional().default(14),
  runId: z.string().optional(),
});

export const GenerateNetworkOverviewResponseSchema = z.object({
  uid: z.string().nullable(),
  generatedAt: z.string(),
  status: z.enum(['READY', 'FAILED', 'SKIPPED']),
});

export type NetworkOverviewStory = z.infer<typeof NetworkOverviewStorySchema>;
export type NetworkOverviewDto = z.infer<typeof NetworkOverviewDtoSchema>;
export type GenerateNetworkOverviewDto = z.infer<typeof GenerateNetworkOverviewDtoSchema>;
export type GenerateNetworkOverviewResponse = z.infer<typeof GenerateNetworkOverviewResponseSchema>;
