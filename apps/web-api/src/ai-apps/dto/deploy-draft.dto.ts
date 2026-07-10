import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { EnvVarNameSchema } from './register-draft.dto';

/**
 * Body of the member-triggered deploy (`POST /v1/ai-apps/:uid/deploy`).
 * `secrets` maps env var names to the values the member entered in LabOS; the
 * values are forwarded to the sandbox runner's secret store (merge/upsert) and
 * never persisted in our database. Omit it to redeploy with already-stored
 * secrets.
 */
export const DeployDraftSchema = z.object({
  secrets: z.record(EnvVarNameSchema, z.string().min(1).max(10000)).optional(),
});

export class DeployDraftDto extends createZodDto(DeployDraftSchema) {}
