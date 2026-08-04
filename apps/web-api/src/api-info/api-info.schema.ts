import { z } from 'zod';
import { API_INFO_SERVICE_NAME } from './api-info.constants';

/**
 * `Date.prototype.toISOString()` output: an ISO-8601 timestamp in UTC.
 * Kept as an explicit regex because this project pins zod 3.19, which predates
 * `z.string().datetime()`.
 */
export const UTC_ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const ApiInfoResponseSchema = z.object({
  /** Constant service identifier. */
  service: z.literal(API_INFO_SERVICE_NAME),
  /** `NODE_ENV`, or `development` when it is not set. */
  environment: z.string().min(1),
  /** `version` from `package.json`, or `unknown` when it cannot be resolved. */
  version: z.string().min(1),
  /** Whole seconds the current process has been running. */
  uptimeSeconds: z.number().int().nonnegative(),
  /** Current UTC ISO-8601 timestamp. */
  timestamp: z.string().regex(UTC_ISO_8601_REGEX),
});

export type ApiInfoResponse = z.infer<typeof ApiInfoResponseSchema>;
