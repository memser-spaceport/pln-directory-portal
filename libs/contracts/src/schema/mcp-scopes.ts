import { z } from 'zod';

/**
 * MCP scope levels per connection (LAB-2995), on the wire. Shared with the frontend's Settings → MCP connections.
 *
 * A leaf module (only `zod`), so specs and the MCP module can import it without the contracts barrel.
 */
export const MCP_SCOPE_KEYS = ['search', 'forum', 'news', 'directory', 'events', 'investors', 'ai_apps'] as const;
export const McpScopeKeySchema = z.enum(MCP_SCOPE_KEYS);
export type McpScopeKey = z.infer<typeof McpScopeKeySchema>;

export const MCP_LEVELS = ['none', 'read', 'write'] as const;
export const McpLevelSchema = z.enum(MCP_LEVELS);
export type McpLevel = z.infer<typeof McpLevelSchema>;

export const McpConnectionStatusSchema = z.enum(['active', 'idle', 'not_used', 'signin_expired']);
export type McpConnectionStatus = z.infer<typeof McpConnectionStatusSchema>;

/** One scope of one connection. `level` is effective (stored level capped by the admin maximum). */
export const McpConnectionScopeSchema = z.object({
  key: McpScopeKeySchema,
  label: z.string(),
  level: McpLevelSchema,
  /** The highest level the member may set. */
  maxLevel: McpLevelSchema,
  /** `admin` when the admin maximum is below what the scope's tools allow. */
  lock: z.enum(['admin']).nullable(),
});
export type McpConnectionScope = z.infer<typeof McpConnectionScopeSchema>;

export const McpConnectionSchema = z.object({
  uid: z.string(),
  clientName: z.string(),
  connectedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  status: McpConnectionStatusSchema,
  scopes: z.array(McpConnectionScopeSchema),
});
export type McpConnection = z.infer<typeof McpConnectionSchema>;

export const McpConnectionsResponseSchema = z.object({ items: z.array(McpConnectionSchema) });
export type McpConnectionsResponse = z.infer<typeof McpConnectionsResponseSchema>;

const levelsMap = z.record(McpLevelSchema).superRefine((value, ctx) => {
  for (const key of Object.keys(value)) {
    if (!(MCP_SCOPE_KEYS as readonly string[]).includes(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown scope: ${key}`, path: [key] });
    }
  }
});

/** PATCH /v1/mcp/authorizations/:uid/scopes */
export const UpdateMcpScopesSchema = z.object({
  levels: levelsMap,
  /** The access request this save answers (LAB-2995 access requests). */
  requestUid: z.string().min(1).optional(),
});
export type UpdateMcpScopes = z.infer<typeof UpdateMcpScopesSchema>;

/** GET /v1/admin/mcp/scopes */
export const McpAdminScopeSchema = z.object({
  key: McpScopeKeySchema,
  label: z.string(),
  /** What the scope's tools allow: `write` if any tool writes, otherwise `read`. */
  registryMax: McpLevelSchema,
  adminMax: McpLevelSchema,
});
export const McpAdminScopesResponseSchema = z.object({ scopes: z.array(McpAdminScopeSchema) });
export type McpAdminScopesResponse = z.infer<typeof McpAdminScopesResponseSchema>;

/** PUT /v1/admin/mcp/scopes */
export const UpdateMcpAdminScopesSchema = z.object({ scopes: levelsMap });
export type UpdateMcpAdminScopes = z.infer<typeof UpdateMcpAdminScopesSchema>;

/** GET /v1/mcp/access-requests/:uid (LAB-3014): a refused agent call the member can allow in Settings. */
export const McpAccessRequestSchema = z.object({
  uid: z.string(),
  authorizationUid: z.string(),
  scope: McpScopeKeySchema,
  level: z.enum(['read', 'write']),
  toolName: z.string(),
  /** `expired` after 7 days without a resolving save. */
  status: z.enum(['open', 'resolved', 'expired']),
  createdAt: z.string(),
});
export type McpAccessRequest = z.infer<typeof McpAccessRequestSchema>;
