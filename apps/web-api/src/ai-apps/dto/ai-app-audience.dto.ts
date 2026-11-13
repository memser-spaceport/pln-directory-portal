import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/** Most policies one app can be published to; the Directory has a few dozen policies in total. */
export const AI_APPS_MAX_AUDIENCE_POLICIES = 100;

/**
 * Body of `PUT /v1/admin/ai-app-audience/:appId`: the FULL list of policy codes the app is published to
 * (replaces the stored one). An empty list takes the app back.
 */
export const UpdateAiAppAudienceSchema = z.object({
  policyCodes: z.array(z.string().trim().min(1).max(200)).max(AI_APPS_MAX_AUDIENCE_POLICIES),
});

export class UpdateAiAppAudienceDto extends createZodDto(UpdateAiAppAudienceSchema) {}
