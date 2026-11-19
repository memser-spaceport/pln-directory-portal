import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/** Most policies one app can be published to; the Directory has a few dozen policies in total. */
export const AI_APPS_MAX_AUDIENCE_POLICIES = 100;
/** Most permissions one app can be published to. */
export const AI_APPS_MAX_AUDIENCE_PERMISSIONS = 200;
/** Most members one app can be published to by name; larger groups belong in a policy or permission. */
export const AI_APPS_MAX_AUDIENCE_MEMBERS = 500;

const code = z.string().trim().min(1).max(200);

/**
 * Body of `PUT /v1/admin/ai-app-audience/:appId`. `policyCodes` is the FULL list of policy codes the app is published
 * to (replaces the stored one). The other fields (LAB-3236) replace the stored value when sent and leave it as is when
 * absent. Policies, permissions and members all empty takes the app back. `path` and `iconUrl` take `null` or `''` to
 * clear.
 */
export const UpdateAiAppAudienceSchema = z.object({
  policyCodes: z.array(code).max(AI_APPS_MAX_AUDIENCE_POLICIES),
  permissionCodes: z.array(code).max(AI_APPS_MAX_AUDIENCE_PERMISSIONS).optional(),
  memberUids: z.array(code).max(AI_APPS_MAX_AUDIENCE_MEMBERS).optional(),
  showInMore: z.boolean().optional(),
  path: z.string().max(100).nullable().optional(),
  iconUrl: z.string().max(2000).nullable().optional(),
  hideTopNav: z.boolean().optional(),
});

export class UpdateAiAppAudienceDto extends createZodDto(UpdateAiAppAudienceSchema) {}
