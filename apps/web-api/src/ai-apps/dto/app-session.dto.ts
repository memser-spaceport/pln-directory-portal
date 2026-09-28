import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

const AppIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'appId must be lowercase letters, numbers and hyphens');
const TargetSchema = z.enum(['prod', 'dev']).default('prod');

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
