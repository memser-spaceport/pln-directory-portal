import { z } from 'zod';

/**
 * One-time UI callout dismissals — a flat map of callout key to `true`.
 *
 * An absent key means "not dismissed"; nothing ever writes `false`, which is
 * why the value is `z.literal(true)` rather than `z.boolean()`. There is no key
 * allowlist on purpose: adding a fourth callout must stay a frontend-only
 * change. The guards here are on *shape*, so the column cannot quietly become a
 * general-purpose key/value store.
 *
 * Defined in its own module, and re-exported from `./member`, for the reason
 * `./job-search-status` is: `member.ts` drags in an import graph that reaches
 * `nestjs-zod/z`, which Jest cannot transform. A spec that needs only these
 * schemas can import this file directly.
 */
export const UI_FLAG_KEY_REGEX = /^[a-z0-9_]{1,64}$/;
export const MAX_UI_FLAGS_PER_REQUEST = 20;

export const UiFlagsSchema = z.record(z.string().regex(UI_FLAG_KEY_REGEX), z.literal(true));

export const UiFlagsPatchSchema = UiFlagsSchema.refine(
  (flags) => Object.keys(flags).length >= 1 && Object.keys(flags).length <= MAX_UI_FLAGS_PER_REQUEST,
  { message: `Provide between 1 and ${MAX_UI_FLAGS_PER_REQUEST} UI flags` }
);
