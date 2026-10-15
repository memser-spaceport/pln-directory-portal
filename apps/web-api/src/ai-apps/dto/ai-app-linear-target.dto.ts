import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/**
 * Body of `PUT /v1/ai-apps/:uid/linear-target`: the private Linear team (and
 * optional project) the app's private feedback is pushed to. `teamId: null`
 * clears the target.
 */
export const UpdateAiAppLinearTargetSchema = z.object({
  teamId: z.string().trim().min(1).max(64).nullable(),
  projectId: z.string().trim().min(1).max(64).nullable().optional(),
});

export class UpdateAiAppLinearTargetDto extends createZodDto(UpdateAiAppLinearTargetSchema) {}
