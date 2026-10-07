import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { coerceAppTarget } from '../ai-apps.constants';

export const AppIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'appId must be lowercase letters, numbers and hyphens');
const TargetSchema = z.preprocess(coerceAppTarget, z.enum(['prod', 'preview']).default('prod'));

/** `POST /v1/ai-apps/sessions/code` (LabOS server) and `/sessions/exchange-token` (auth gate), member JWT. */
export const AppSessionRequestSchema = z.object({ appId: AppIdSchema, target: TargetSchema });
export class AppSessionRequestDto extends createZodDto(AppSessionRequestSchema) {}

/** `POST /v1/ai-apps/sessions/redeem` (auth gate): the one-time code is the credential. */
export const RedeemAppSessionCodeSchema = z.object({
  code: z.string().min(20).max(200),
  appId: AppIdSchema,
  target: TargetSchema,
});
export class RedeemAppSessionCodeDto extends createZodDto(RedeemAppSessionCodeSchema) {}

/** `POST /v1/ai-apps/admin/auth-gate/refresh` (directory admin). */
export const RefreshAuthGatesSchema = z.object({
  appUids: z.array(z.string().min(1)).max(200).optional(),
  target: z.preprocess(coerceAppTarget, z.enum(['prod', 'preview']).optional()),
  batchSize: z.number().int().positive().max(200).optional(),
  dryRun: z.boolean().default(false),
  maxFailures: z.number().int().positive().max(50).default(1),
  gateOverrides: z.record(z.unknown()).optional(),
});
export class RefreshAuthGatesDto extends createZodDto(RefreshAuthGatesSchema) {}

/** `POST /v1/ai-apps/admin/auth-gate/:uid/rollback` (directory admin). */
export const RollbackAuthGateSchema = z.object({ target: TargetSchema });
export class RollbackAuthGateDto extends createZodDto(RollbackAuthGateSchema) {}
