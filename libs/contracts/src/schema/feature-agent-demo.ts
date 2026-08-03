import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/** ISO-8601 UTC timestamp, e.g. `2024-05-17T12:34:56.789Z` (zod 3.19 has no `.datetime()`). */
const IsoUtcTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

export const FeatureAgentDemoResponseSchema = z.object({
  message: z.string(),
  environment: z.string(),
  feature: z.string(),
  timestamp: IsoUtcTimestamp,
});

export class FeatureAgentDemoResponseDto extends createZodDto(FeatureAgentDemoResponseSchema) {}
