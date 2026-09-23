import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { AI_APPS_MAX_ALLOWED_MEMBERS } from '../ai-apps.constants';
import { AI_APPS_MAX_REQUEST_PATH_LENGTH } from '../ai-apps-public-paths';

/**
 * Body of `PUT /v1/ai-apps/:uid/access`: the app's access mode plus its FULL
 * whitelist (replaces the stored one). The whitelist is kept while the app is
 * OPEN, so switching back to PRIVATE restores it.
 */
export const UpdateAiAppAccessSchema = z.object({
  access: z.enum(['OPEN', 'PRIVATE']),
  memberUids: z.array(z.string().trim().min(1).max(64)).max(AI_APPS_MAX_ALLOWED_MEMBERS).default([]),
});

export class UpdateAiAppAccessDto extends createZodDto(UpdateAiAppAccessSchema) {}

/** Query of `GET /v1/ai-apps/:uid/access/candidates` — member name search for the whitelist picker. */
export const AiAppAccessCandidatesQuerySchema = z.object({
  search: z.string().trim().min(1).max(100),
});

export class AiAppAccessCandidatesQueryDto extends createZodDto(AiAppAccessCandidatesQuerySchema) {}

/** Query of `GET /v1/ai-apps/access-check` — called by a deployed app's auth sidecar on every request. */
export const AiAppAccessCheckQuerySchema = z.object({
  appId: z.string().trim().min(1).max(200),
  method: z.string().trim().min(1).max(16).default('GET'),
  /** Original request path (query optional) — sent by sidecars that support public paths. */
  path: z.string().max(AI_APPS_MAX_REQUEST_PATH_LENGTH).optional(),
});

export class AiAppAccessCheckQueryDto extends createZodDto(AiAppAccessCheckQuerySchema) {}

/**
 * Shape of a public-paths list. The pattern rules (and their 400 with
 * `invalidPatterns`) live in `assertValidPublicPaths`, applied by the service.
 */
export const PublicPathsListSchema = z.array(z.string().max(500)).max(100);

/** Body of `PUT /v1/ai-apps/:uid/public-paths`: the app's FULL public path list (`[]` clears it). */
export const UpdateAiAppPublicPathsSchema = z.object({
  publicPaths: PublicPathsListSchema,
});

export class UpdateAiAppPublicPathsDto extends createZodDto(UpdateAiAppPublicPathsSchema) {}
