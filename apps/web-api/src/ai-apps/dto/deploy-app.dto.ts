import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/**
 * Multipart form fields posted by the member's AI agent to `/v1/ai-apps/deploy`
 * alongside the app ZIP file. App metadata (name/description) is parsed from
 * here — apps are lazy-created on first deploy, there is no separate
 * registration step. The S3 key is derived server-side from appId + deploymentId.
 */
export const DeployAppSchema = z.object({
  appId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'appId must be lowercase letters, numbers and hyphens'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  deploymentId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, 'deploymentId must be alphanumeric and hyphens'),
  /**
   * Starter-kit version the agent deployed with (from `pln-app.config.json`,
   * sent by kits ≥1.4). Optional so older kits keep working; stored on the app
   * for debugging.
   */
  kitVersion: z
    .string()
    .max(20)
    .regex(/^\d+(\.\d+){0,2}$/, 'kitVersion must look like 1.4 or 1.4.1')
    .optional(),
});

export class DeployAppDto extends createZodDto(DeployAppSchema) {}
