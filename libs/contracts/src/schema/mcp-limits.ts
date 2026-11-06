import { z } from 'zod';

/**
 * MCP call types (LAB-3149). A leaf module (only `zod`), same as `mcp-scopes.ts`.
 * Limit numbers live in `apps/web-api/src/mcp/mcp-limits.config.ts`, not here.
 */
export const MCP_CALL_TYPES = ['read', 'contact_read', 'write', 'forum_post'] as const;
export const McpCallTypeSchema = z.enum(MCP_CALL_TYPES);
export type McpCallType = z.infer<typeof McpCallTypeSchema>;

const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: 'endsAt must be a time' });

/** PUT /v1/admin/mcp/limits/:memberUid */
export const UpsertMcpLimitOverrideSchema = z.object({
  callType: McpCallTypeSchema,
  limit: z.number().int().positive().max(1_000_000),
  /** ISO time. Omit or null for no end date. */
  endsAt: isoTime.nullable().optional(),
});
export type UpsertMcpLimitOverride = z.infer<typeof UpsertMcpLimitOverrideSchema>;
