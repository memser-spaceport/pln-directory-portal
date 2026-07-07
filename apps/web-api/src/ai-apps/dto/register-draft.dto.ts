import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { DeployAppSchema } from './deploy-app.dto';

/** Conventional env-var name: uppercase letters, digits, underscores. */
export const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;

export const EnvVarNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(ENV_VAR_NAME_REGEX, 'env var names must be UPPER_SNAKE_CASE');

/**
 * Multipart fields the AI agent posts to `/v1/ai-apps/draft` alongside the app
 * ZIP when the app needs runtime secrets. Same shape as a deploy, plus the env
 * var NAMES the app requires — the member supplies the values later in LabOS.
 * Multipart delivers `requiredEnvVars` as a string, so accept a JSON array
 * (`["A","B"]`) or a comma-separated list (`A,B`).
 */
export const RegisterDraftSchema = DeployAppSchema.extend({
  requiredEnvVars: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  }, z.array(EnvVarNameSchema).min(1).max(50)),
});

export class RegisterDraftDto extends createZodDto(RegisterDraftSchema) {}
