import { z } from 'zod';

/**
 * What a team-scoped integration key may do. A key holds one or more of these;
 * integration routes declare which they need.
 */
export const INTEGRATION_KEY_SCOPES = ['jobs:write', 'candidates:read'] as const;
export const IntegrationKeyScopeSchema = z.enum(INTEGRATION_KEY_SCOPES);
export type IntegrationKeyScope = z.infer<typeof IntegrationKeyScopeSchema>;

const ScopesSchema = z
  .array(IntegrationKeyScopeSchema)
  .min(1)
  .refine((scopes) => new Set(scopes).size === scopes.length, { message: 'scopes must be unique' });

export const CreateIntegrationKeyRequestSchema = z.object({
  teamUid: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  scopes: ScopesSchema,
});
export type CreateIntegrationKeyRequest = z.infer<typeof CreateIntegrationKeyRequestSchema>;

export const ListIntegrationKeysQuerySchema = z.object({
  teamUid: z.string().min(1),
});
export type ListIntegrationKeysQuery = z.infer<typeof ListIntegrationKeysQuerySchema>;

/** A key as an admin sees it. Never carries the key or its hash. */
export const IntegrationKeyListItemSchema = z.object({
  uid: z.string(),
  name: z.string(),
  teamUid: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(IntegrationKeyScopeSchema),
  createdByUid: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type IntegrationKeyListItem = z.infer<typeof IntegrationKeyListItemSchema>;

/** Returned once, on creation. `key` is the plaintext and is never shown again. */
export const CreateIntegrationKeyResponseSchema = IntegrationKeyListItemSchema.extend({
  key: z.string(),
});
export type CreateIntegrationKeyResponse = z.infer<typeof CreateIntegrationKeyResponseSchema>;

/** `GET /v1/integrations/me`: the calling key describing itself. */
export const IntegrationKeyMeResponseSchema = z.object({
  uid: z.string(),
  keyPrefix: z.string(),
  name: z.string(),
  teamUid: z.string(),
  teamName: z.string(),
  scopes: z.array(IntegrationKeyScopeSchema),
});
export type IntegrationKeyMeResponse = z.infer<typeof IntegrationKeyMeResponseSchema>;
