import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ADMIN_PERMISSIONS, FORUM_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { MasterProfileService } from '../master-profile/master-profile.service';
import { relationKindFromHopChain } from '../warm-intros-v2/warm-intros-v2-enrich.util';
import { WarmIntrosV2Service } from '../warm-intros-v2/warm-intros-v2.service';
import { INVESTOR_DB_VIEW_PERMISSION } from './mcp.constants';

export type McpActorContext = {
  memberUid: string;
  name: string;
  email: string | null;
  permissions: Set<string>;
  authorizationUid: string;
  clientName: string;
};

export type McpToolDef = {
  name: string;
  description: string;
  visibility: 'always' | 'investor_db' | 'forum';
  inputSchema?: Record<string, z.ZodTypeAny>;
  execute: (ctx: McpActorContext, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const MASTER_PROFILE_TYPES = ['pl_internal', 'investor', 'co_investor', 'founder'] as const;
const WARM_INTRO_TARGET_SETS = ['neuro-fund-i', 'gold-co-investors'] as const;
const WARM_INTRO_RELATION_KINDS = ['pl_direct', 'founder_bridge', 'coinvestor_bridge'] as const;
const MCP_LIST_LIMIT_MAX = 50;
const FEEDBACK_NOTE_MAX = 600;

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

export function warmIntroTools(masterProfiles: MasterProfileService, warmIntros: WarmIntrosV2Service): McpToolDef[] {
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
    {
      name: 'search_warm_intro_investors',
      description:
        'Search investors who have warm paths. Same filters as Warm Intros. Returns compact rows (name, org, score, best connector, short path summary). Then call get_warm_intro_investor with a profileUid for the full path set. To inspect a person on a path, use get_master_profile.',
      visibility: 'investor_db',
      inputSchema: {
        targetSet: z
          .enum(WARM_INTRO_TARGET_SETS)
          .optional()
          .describe('Target list: neuro-fund-i or gold-co-investors. Omit for All.'),
        search: z.string().optional().describe('Case-insensitive match on investor name or email'),
        connectorProfileUid: z.string().optional().describe('Master profile uid of a connector on the path'),
        sector: z.string().optional().describe('Case-insensitive: investor sectors contain this value'),
        relationKind: z
          .enum(WARM_INTRO_RELATION_KINDS)
          .optional()
          .describe('Path kind: pl_direct, founder_bridge, or coinvestor_bridge'),
        bridgeProfileUid: z.string().optional().describe('Master profile uid of the founder/co-investor bridge person'),
        plBacker: z.boolean().optional().describe('When true, only investors with PL/FIL backing on record'),
        limit: z.number().int().min(1).max(MCP_LIST_LIMIT_MAX).optional().describe('Max rows (default 20, max 50)'),
        offset: z.number().int().min(0).optional().describe('Pagination offset'),
      },
      execute: async (_ctx, args) => searchWarmIntroInvestors(warmIntros, args),
    },
    {
      name: 'get_warm_intro_investor',
      description:
        'Fetch one investor by profileUid and return the investor summary plus all warm paths (hop chain, connectors, scores). Search first with search_warm_intro_investors. Does not include path feedback or the full master profile — call those tools separately.',
      visibility: 'investor_db',
      inputSchema: {
        profileUid: z.string().min(1).describe('Investor master profile uid from search_warm_intro_investors'),
        targetSet: z
          .enum(WARM_INTRO_TARGET_SETS)
          .optional()
          .describe('Optional target list. Omit to return paths across all lists.'),
      },
      execute: async (_ctx, args) => getWarmIntroInvestor(warmIntros, args),
    },
    {
      name: 'submit_warm_path_feedback',
      description:
        "Submit or update this user's correction note on a warm path (the path is wrong). Not for general path notes. Pass note: null to clear. Requires warmPathUid and connectorProfileUid from get_warm_intro_investor.",
      visibility: 'investor_db',
      inputSchema: {
        warmPathUid: z.string().min(1).describe('Warm path uid from get_warm_intro_investor'),
        connectorProfileUid: z
          .string()
          .min(1)
          .describe('Connector master profile uid on that path (bestConnectorProfileUid or hop chain)'),
        note: z
          .union([z.string().max(FEEDBACK_NOTE_MAX), z.null()])
          .describe("Correction note (max 600). Null clears this user's note on the path."),
      },
      execute: async (ctx, args) => submitWarmPathFeedback(warmIntros, ctx, args),
    },
    {
      name: 'get_warm_path_feedback',
      description:
        "Return this user's own correction note on a warm path, or note: null if none. Does not return other people's feedback. Requires warmPathUid and connectorProfileUid from get_warm_intro_investor.",
      visibility: 'investor_db',
      inputSchema: {
        warmPathUid: z.string().min(1).describe('Warm path uid from get_warm_intro_investor'),
        connectorProfileUid: z
          .string()
          .min(1)
          .describe('Connector master profile uid on that path (bestConnectorProfileUid or hop chain)'),
      },
      execute: async (ctx, args) => getWarmPathFeedback(warmIntros, ctx, args),
    },
    {
      name: 'submit_warm_path_note',
      description:
        "Submit or update this user's note on a warm path (outreach status, next step, useful context). Not for reporting that the path is wrong — use submit_warm_path_feedback for that. Pass note: null to clear. Requires warmPathUid and connectorProfileUid from get_warm_intro_investor.",
      visibility: 'investor_db',
      inputSchema: {
        warmPathUid: z.string().min(1).describe('Warm path uid from get_warm_intro_investor'),
        connectorProfileUid: z
          .string()
          .min(1)
          .describe('Connector master profile uid on that path (bestConnectorProfileUid or hop chain)'),
        note: z
          .union([z.string().max(FEEDBACK_NOTE_MAX), z.null()])
          .describe("Path note (max 600). Null clears this user's note on the path."),
      },
      execute: async (ctx, args) => submitWarmPathNote(warmIntros, ctx, args),
    },
    {
      name: 'get_warm_path_note',
      description:
        "Return this user's own note on a warm path, or note: null if none. Does not return other people's notes. Requires warmPathUid and connectorProfileUid from get_warm_intro_investor.",
      visibility: 'investor_db',
      inputSchema: {
        warmPathUid: z.string().min(1).describe('Warm path uid from get_warm_intro_investor'),
        connectorProfileUid: z
          .string()
          .min(1)
          .describe('Connector master profile uid on that path (bestConnectorProfileUid or hop chain)'),
      },
      execute: async (ctx, args) => getWarmPathNote(warmIntros, ctx, args),
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

export function compactWarmIntroInvestor(row: Record<string, unknown>) {
  const investor = recordArg(row.investor);
  const bestConnector = recordArg(row.bestConnector);
  const pathSummary = recordArg(row.pathSummary);
  return {
    profileUid: investor?.profileUid ?? row.targetProfileUid,
    name: investor?.name ?? null,
    currentOrg: investor?.currentOrg ?? null,
    score: row.score,
    scorePercent: row.scorePercent,
    scoreBand: row.scoreBand ?? null,
    bestConnector: bestConnector ? { profileUid: bestConnector.profileUid, name: bestConnector.name } : null,
    path: {
      explanation: pathSummary?.explanation ?? null,
      hopCount: row.hopCount,
      relationKind: relationKindFromHopChain(row.hopChain),
    },
    targetSet: row.targetSet,
  };
}

export async function searchWarmIntroInvestors(
  warmIntros: WarmIntrosV2Service,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), MCP_LIST_LIMIT_MAX);
  const offset = Math.max(Number(args.offset ?? 0) || 0, 0);
  const result = await warmIntros.listPaths({
    targetSet: stringArg(args.targetSet),
    search: stringArg(args.search),
    connectorProfileUid: stringArg(args.connectorProfileUid),
    sector: stringArg(args.sector),
    relationKind: stringArg(args.relationKind),
    bridgeProfileUid: stringArg(args.bridgeProfileUid),
    plBacker: args.plBacker === true ? 'true' : undefined,
    limit: String(limit),
    offset: String(offset),
  });
  return {
    investors: result.paths.map((row) => compactWarmIntroInvestor(row as unknown as Record<string, unknown>)),
    total: result.total,
    limit,
    offset,
  };
}

export async function getWarmIntroInvestor(
  warmIntros: WarmIntrosV2Service,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const profileUid = stringArg(args.profileUid) ?? '';
  const result = await warmIntros.getPathsByInvestor(profileUid, { targetSet: stringArg(args.targetSet) });
  if (result.paths.length === 0) {
    throw new NotFoundException(`No warm paths found for investor: ${profileUid}`);
  }
  return result as unknown as Record<string, unknown>;
}

export function compactOwnPathFeedback(
  warmPathUid: string,
  connectorProfileUid: string,
  result: Record<string, unknown>
) {
  if (result.deleted === true) {
    return { warmPathUid, connectorProfileUid, note: null, updatedAt: null };
  }
  return {
    warmPathUid,
    connectorProfileUid,
    note: typeof result.note === 'string' ? result.note : null,
    updatedAt: typeof result.updatedAt === 'string' ? result.updatedAt : null,
  };
}

function feedbackActor(ctx: McpActorContext) {
  return { uid: ctx.memberUid, email: ctx.email };
}

function noteArg(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return null;
}

export async function submitWarmPathFeedback(
  warmIntros: WarmIntrosV2Service,
  ctx: McpActorContext,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const warmPathUid = stringArg(args.warmPathUid) ?? '';
  const connectorProfileUid = stringArg(args.connectorProfileUid) ?? '';
  const result = await warmIntros.upsertPathFeedback(
    warmPathUid,
    { connectorProfileUid, note: noteArg(args.note) },
    feedbackActor(ctx)
  );
  return compactOwnPathFeedback(warmPathUid, connectorProfileUid, result as unknown as Record<string, unknown>);
}

export async function getWarmPathFeedback(
  warmIntros: WarmIntrosV2Service,
  ctx: McpActorContext,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  return warmIntros.getMyPathFeedback(
    stringArg(args.warmPathUid) ?? '',
    stringArg(args.connectorProfileUid) ?? '',
    feedbackActor(ctx)
  );
}

export async function submitWarmPathNote(
  warmIntros: WarmIntrosV2Service,
  ctx: McpActorContext,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const warmPathUid = stringArg(args.warmPathUid) ?? '';
  const connectorProfileUid = stringArg(args.connectorProfileUid) ?? '';
  const result = await warmIntros.upsertPathNote(
    warmPathUid,
    { connectorProfileUid, note: noteArg(args.note) },
    feedbackActor(ctx)
  );
  return compactOwnPathFeedback(warmPathUid, connectorProfileUid, result as unknown as Record<string, unknown>);
}

export async function getWarmPathNote(
  warmIntros: WarmIntrosV2Service,
  ctx: McpActorContext,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  return warmIntros.getMyPathNote(
    stringArg(args.warmPathUid) ?? '',
    stringArg(args.connectorProfileUid) ?? '',
    feedbackActor(ctx)
  );
}

function stringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function recordArg(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isToolVisible(tool: McpToolDef, permissions: Set<string>): boolean {
  if (tool.visibility === 'always') {
    return true;
  }
  if (tool.visibility === 'forum') {
    return permissions.has(FORUM_PERMISSIONS.READ);
  }
  return permissions.has(INVESTOR_DB_VIEW_PERMISSION) || permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL);
}

export function toolsForPermissions(permissions: Set<string>, catalog: McpToolDef[] = [WHOAMI_TOOL]): McpToolDef[] {
  return catalog.filter((tool) => isToolVisible(tool, permissions));
}
