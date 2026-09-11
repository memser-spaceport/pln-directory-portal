import { BadRequestException } from '@nestjs/common';

/**
 * Keys the GET response *injects* rather than stores.
 *
 * `buildPreferenceResponse` computes these from member columns — whether the
 * member has an email, a GitHub handle, a newsletter subscription — and merges
 * them into the object it returns. They look exactly like settings, and
 * `EditContactForm` echoes several of them straight back on save.
 *
 * Persisting them would freeze a snapshot of the live columns into the blob,
 * where it would shadow the real values from then on. So they are dropped on
 * the way in.
 */
export const DERIVED_PREFERENCE_KEYS = [
  'isNull',
  'email',
  'github',
  'telegram',
  'discord',
  'linkedin',
  'twitter',
  'bluesky',
  'subscription',
] as const;

/**
 * Validate an incoming preferences body and reduce it to what may be stored.
 *
 * Deliberately permissive about *which* settings keys it accepts: the stored
 * shape has grown past `PreferenceSchema` (which knows the nine contact keys
 * but none of `showForumBanner`, `showOfficeHoursDialog`,
 * `showDemoDayConnectDialog`, `showDemoDayInvestDialog`), and rejecting unknown
 * keys here would break live clients rather than protect anyone. What it does
 * enforce is that the body is a plain object, so a string or an array cannot
 * reach a `jsonb` merge.
 *
 * @throws BadRequestException when the body is not a plain object.
 */
export function toPreferencePatch(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('preferences must be an object');
  }

  const patch: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of DERIVED_PREFERENCE_KEYS) {
    delete patch[key];
  }
  return patch;
}
