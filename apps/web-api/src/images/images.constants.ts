/**
 * Anonymous POST /v1/images (sign-up, onboarding, directory profile/team/rich-text).
 * The throttler tracks req.ip. The store is in-memory, so the limit is per pod.
 * ttl is seconds, matching @nestjs/throttler v3.
 */
export const ANONYMOUS_IMAGE_UPLOAD_LIMIT = 60;
export const ANONYMOUS_IMAGE_UPLOAD_TTL_SECONDS = 60;
