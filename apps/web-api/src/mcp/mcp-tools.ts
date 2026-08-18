import { z } from 'zod';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { MasterProfileService } from '../master-profile/master-profile.service';
import { INVESTOR_DB_VIEW_PERMISSION } from './mcp.constants';

export type McpActorContext = {
  memberUid: string;
  name: string;
  email: string | null;
  permissions: Set<string>;
};

export type McpToolDef = {
  name: string;
  description: string;
  visibility: 'always' | 'investor_db';
  inputSchema?: Record<string, z.ZodTypeAny>;
  execute: (ctx: McpActorContext, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const MASTER_PROFILE_TYPES = ['pl_internal', 'investor', 'co_investor', 'founder'] as const;
const MCP_LIST_LIMIT_MAX = 50;

export const WHOAMI_TOOL: McpToolDef = {
  name: 'whoami',
  description: 'Return the Directory member this agent is acting as.',
  visibility: 'always',
  execute: async (ctx) => ({
    memberUid: ctx.memberUid,
    name: ctx.name,
    email: ctx.email,
  }),
};

export function warmIntroTools(masterProfiles: MasterProfileService): McpToolDef[] {
  return [
    {
      name: 'search_master_profiles',
      description:
        'Search master profiles by name, email, type, and current org. Returns compact rows only (uid, canonicalName, currentOrg, currentTitle, types). Then call get_master_profile with a uid for the full stored record, including raw and sourceSnapshots.',
      visibility: 'investor_db',
      inputSchema: {
        name: z.string().optional().describe('Case-insensitive substring on canonical name'),
        email: z.string().optional().describe('Case-insensitive substring on stored emails'),
        type: z
          .enum(MASTER_PROFILE_TYPES)
          .optional()
          .describe('Filter by profile type: pl_internal, investor, co_investor, or founder'),
        currentOrg: z.string().optional().describe('Case-insensitive substring on current organization'),
        limit: z.number().int().min(1).max(MCP_LIST_LIMIT_MAX).optional().describe('Max rows (default 20, max 50)'),
        offset: z.number().int().min(0).optional().describe('Pagination offset'),
      },
      execute: async (_ctx, args) => searchMasterProfiles(masterProfiles, args),
    },
    {
      name: 'get_master_profile',
      description:
        'Fetch one master profile by uid and return the full stored record, including raw and sourceSnapshots. Search first with search_master_profiles to get a uid.',
      visibility: 'investor_db',
      inputSchema: {
        uid: z.string().min(1).describe('Master profile uid from search_master_profiles'),
      },
      execute: async (_ctx, args) => getMasterProfile(masterProfiles, args),
    },
  ];
}

export function compactMasterProfile(row: Record<string, unknown>) {
  return {
    uid: row.uid,
    canonicalName: row.canonicalName,
    currentOrg: row.currentOrg ?? null,
    currentTitle: row.currentTitle ?? null,
    types: Array.isArray(row.types) ? row.types : [],
  };
}

export async function searchMasterProfiles(
  masterProfiles: MasterProfileService,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), MCP_LIST_LIMIT_MAX);
  const offset = Math.max(Number(args.offset ?? 0) || 0, 0);
  const result = await masterProfiles.lookup({
    name: stringArg(args.name),
    email: stringArg(args.email),
    type: stringArg(args.type),
    currentOrg: stringArg(args.currentOrg),
    limit: String(limit),
    offset: String(offset),
  });
  const profiles = 'profiles' in result ? result.profiles : [];
  return {
    profiles: (profiles as Record<string, unknown>[]).map(compactMasterProfile),
    limit: 'limit' in result ? result.limit : limit,
    offset: 'offset' in result ? result.offset : offset,
  };
}

export async function getMasterProfile(
  masterProfiles: MasterProfileService,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const uid = stringArg(args.uid) ?? '';
  const profile = await masterProfiles.getByUid(uid);
  return profile as unknown as Record<string, unknown>;
}

function stringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function isToolVisible(tool: McpToolDef, permissions: Set<string>): boolean {
  if (tool.visibility === 'always') {
    return true;
  }
  return permissions.has(INVESTOR_DB_VIEW_PERMISSION) || permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL);
}

export function toolsForPermissions(permissions: Set<string>, catalog: McpToolDef[] = [WHOAMI_TOOL]): McpToolDef[] {
  return catalog.filter((tool) => isToolVisible(tool, permissions));
}
