import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/** Database engines the Deployment Orchestrator can provision on request. */
export const AI_APPS_SUPPORTED_DATABASE_TYPES = ['postgres'] as const;

/**
 * Opt-in database provisioning. The app never generates credentials or
 * creates the database itself — sending this just asks the Deployment
 * Orchestrator to provision one and inject the connection env vars into the
 * runtime. A member who wants their own database instead skips this field
 * entirely and supplies their connection string as a regular runtime secret
 * (see the draft flow's `requiredEnvVars`).
 */
export const DatabaseConfigSchema = z.object({
  enabled: z.literal(true),
  type: z.enum(AI_APPS_SUPPORTED_DATABASE_TYPES),
});

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
  /**
   * Model the agent reports running on (e.g. "claude-sonnet-4-5", "gpt-5").
   * Free-form, self-reported, optional — stored for debugging. The agent's
   * TOOL name isn't sent here; it comes from the connect session's clientName.
   */
  agentModel: z.string().trim().min(1).max(100).optional(),
  /**
   * Opt-in database provisioning request, e.g. `{"enabled":true,"type":"postgres"}`.
   * Multipart delivers it as a JSON string; absent entirely when the member
   * brought their own database (or hasn't been asked yet).
   */
  database: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }, DatabaseConfigSchema.optional()),
});

export class DeployAppDto extends createZodDto(DeployAppSchema) {}
