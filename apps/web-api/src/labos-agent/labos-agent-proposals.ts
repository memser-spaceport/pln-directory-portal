import { CACHE_MANAGER, Inject, Injectable } from '@nestjs/common';
import { CoreTool, tool } from 'ai';
import { Cache } from 'cache-manager';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  LabosAgentChangeValue,
  LabosAgentProposal,
  LabosAgentProposeTool,
} from 'libs/contracts/src/schema/labos-agent';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { McpActorContext, McpToolDef } from '../mcp/mcp-tools';
import { PrismaService } from '../shared/prisma.service';

/** A proposal is open for 15 minutes (contract section 4). */
export const PROPOSAL_TTL_SECONDS = 15 * 60;
/** The record stays longer than the proposal, so C2 can tell 409 (closed) and 410 (expired) from 404. */
const RECORD_TTL_SECONDS = 24 * 60 * 60;

export type StoredProposal = {
  proposal: LabosAgentProposal;
  memberUid: string;
  tool: LabosAgentProposeTool;
  args: Record<string, unknown>;
  status: 'open' | 'cancelled' | 'done' | 'failed';
  /** LAB-3457: the saved thread of the turn (C1 `persist: true`), so C2 can write the card state there. */
  threadId?: string;
};

/**
 * Keys start with the app environment (`ENVIRONMENT`), the same `<env>:` prefix as member proofs and member access.
 * Feature envs share the dev Redis, so one env never reads or closes another env's proposal.
 */
export const keyPrefix = () => `${process.env.ENVIRONMENT ?? 'local'}:labos-agent`;
export const proposalRecordKey = (id: string) => `${keyPrefix()}:proposal:${id}`;
const openKey = (id: string) => `${keyPrefix()}:proposal-open:${id}`;

/**
 * LAB-3367 B3: the kept intro targets of one member and thread, for 10 minutes. `page` is the JSON of the C1 `context` of
 * the ask (uids only): on another page they are not used. `noPage`: that page was no intro target. `both`: the page can
 * be the recipient too. `unclear`: the member did not choose a target (an ask with a chip that can be the recipient).
 */
export type PendingIntroTarget = {
  targets: Array<{ type: 'member' | 'team'; uid: string }>;
  page: string;
  noPage?: true;
  both?: true;
  unclear?: true;
};
export const introTargetKey = (memberUid: string, threadId: string) =>
  `${keyPrefix()}:intro-target:${JSON.stringify([memberUid, threadId])}`;

/**
 * LAB-3367 B4: the experience claims in the member's own messages of one thread, for the claim check of a later draft.
 * Only the claim sentences (`ownClaims`), never the draft text. The TTL is the one of the proposal records.
 */
export const ownClaimsKey = (memberUid: string, threadId: string) =>
  `${keyPrefix()}:own-claims:${JSON.stringify([memberUid, threadId])}`;
const MAX_OWN_CLAIMS = 20;

/** Proposals in the shared cache (Redis). No database table (contract assumption 5). */
@Injectable()
export class LabosAgentProposalStore {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async save(stored: StoredProposal): Promise<void> {
    const id = stored.proposal.proposalId;
    await this.cache.set(proposalRecordKey(id), stored, { ttl: RECORD_TTL_SECONDS });
    await this.cache.set(openKey(id), 1, { ttl: RECORD_TTL_SECONDS });
  }

  async load(id: string): Promise<StoredProposal | undefined> {
    return (await this.cache.get<StoredProposal>(proposalRecordKey(id))) ?? undefined;
  }

  /** Redis DEL answers 1 to exactly one caller, so only one confirm or cancel closes a proposal (as member proofs). */
  async claim(id: string): Promise<boolean> {
    return (await (this.cache.del as (key: string) => Promise<unknown>)(openKey(id))) === 1;
  }

  async saveIntroTarget(key: string, target: PendingIntroTarget): Promise<void> {
    await this.cache.set(key, target, { ttl: 10 * 60 });
  }

  async loadIntroTarget(key: string): Promise<PendingIntroTarget | undefined> {
    const value = await this.cache.get<PendingIntroTarget>(key);
    const valid =
      typeof value?.page === 'string' &&
      Array.isArray(value.targets) &&
      value.targets.length > 0 &&
      value.targets.every((item) => (item?.type === 'member' || item?.type === 'team') && !!item.uid);
    return valid ? value : undefined;
  }

  async clearIntroTarget(key: string): Promise<void> {
    await this.cache.del(key);
  }

  /** Adds the sentences and keeps the newest ones. Not atomic: two quick messages can lose one sentence. */
  async addOwnClaims(key: string, sentences: string[]): Promise<void> {
    const known = await this.loadOwnClaims(key);
    const claims = [...new Set([...known, ...sentences])].slice(-MAX_OWN_CLAIMS);
    await this.cache.set(key, claims, { ttl: RECORD_TTL_SECONDS });
  }

  async loadOwnClaims(key: string): Promise<string[]> {
    const value = await this.cache.get<string[]>(key);
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  }

  async close(stored: StoredProposal, status: StoredProposal['status']): Promise<void> {
    await this.cache.set(
      proposalRecordKey(stored.proposal.proposalId),
      { ...stored, status },
      { ttl: RECORD_TTL_SECONDS }
    );
  }
}

/** True when the member leads the team, or is a directory admin (the same rule as `update_team`). */
export async function canChangeTeam(prisma: PrismaService, ctx: McpActorContext, teamUid: string): Promise<boolean> {
  if (ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL)) return true;
  const role = await prisma.teamMemberRole.findFirst({
    where: { memberUid: ctx.memberUid, teamUid, teamLead: true },
    select: { teamUid: true },
  });
  return role !== null;
}

const LABELS: Record<string, string> = {
  githubHandler: 'GitHub',
  linkedinHandler: 'LinkedIn',
  twitterHandler: 'X (Twitter)',
  telegramHandler: 'Telegram',
  discordHandler: 'Discord',
  blueskyHandler: 'Bluesky',
  teamOrProjectURL: 'Team or project URL',
  plnFriend: 'PL friend',
  plnStartDate: 'PL start date',
};

export function fieldLabel(field: string): string {
  if (LABELS[field]) return LABELS[field];
  const words = field.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A value as the action card shows it: text, number, true or false, a list of text, or null. */
function cardValue(value: unknown): LabosAgentChangeValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map((item) => String((item as { title?: unknown })?.title ?? item));
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String((value as { title?: unknown }).title ?? JSON.stringify(value));
}

function changes(args: Record<string, unknown>, current: Record<string, unknown>, skip: string[] = []) {
  return Object.keys(args)
    .filter((field) => !skip.includes(field))
    .map((field) => ({
      field,
      label: fieldLabel(field),
      oldValue: cardValue(current[field]),
      newValue: cardValue(args[field]),
    }));
}

export type ProposalDeps = {
  prisma: PrismaService;
  /** The member's read tools by name (`get_my_profile`, `list_my_experiences`). */
  reads: Map<string, McpToolDef>;
};

type Draft = Omit<LabosAgentProposal, 'proposalId' | 'expiresAt'>;

/** Builds the card for one propose-only call from the member's current data. A string is a refusal for the model. */
async function draft(
  name: LabosAgentProposeTool,
  ctx: McpActorContext,
  args: Record<string, unknown>,
  deps: ProposalDeps
): Promise<Draft | string> {
  const member = { targetType: 'member' as const, targetUid: ctx.memberUid };
  if (name === 'update_my_profile') {
    const current = (await deps.reads.get('get_my_profile')?.execute(ctx, {})) ?? {};
    const list = changes(args, current);
    return { tool: name, title: `Update your ${list.map((c) => c.label).join(', ')}`, ...member, changes: list };
  }
  if (name === 'add_experience') {
    const list = changes(args, {});
    return { tool: name, title: `Add ${args.title} at ${args.company} to your experience`, ...member, changes: list };
  }
  if (name === 'update_experience') {
    const listed = (await deps.reads.get('list_my_experiences')?.execute(ctx, {}))?.experiences;
    const row = ((listed as Array<Record<string, unknown>>) ?? []).find((item) => item.uid === args.experienceUid);
    if (!row) return `Experience not found: ${args.experienceUid}. Call list_my_experiences for the uids.`;
    const list = changes(args, row, ['experienceUid']);
    return { tool: name, title: `Update your experience at ${row.company}`, ...member, changes: list };
  }
  const teamUid = String(args.teamUid);
  if (!(await canChangeTeam(deps.prisma, ctx, teamUid))) {
    return 'The member is not a lead of this team, so the member cannot change the team. Make no proposal. Tell the member this.';
  }
  const team = await deps.prisma.team.findFirst({
    where: { uid: teamUid },
    include: { fundingStage: { select: { title: true } }, industryTags: { select: { title: true } } },
  });
  if (!team) return `Team not found: ${teamUid}`;
  const list = changes(args, team as unknown as Record<string, unknown>, ['teamUid']);
  return { tool: name, title: `Update ${team.name}`, targetType: 'team', targetUid: teamUid, changes: list };
}

/**
 * The propose variant of a write tool for the chat (LAB-3299). It checks the arguments against the tool's own
 * schema, builds the card from current data, stores the proposal and adds it to `proposals`. It never writes.
 */
export function proposeTool(
  def: McpToolDef,
  ctx: McpActorContext,
  deps: ProposalDeps & { store: LabosAgentProposalStore; proposals: LabosAgentProposal[]; threadId?: string }
): CoreTool {
  const schema = z.object(def.inputSchema ?? {}).strict();
  return tool({
    description:
      `${def.description} In this chat the tool only makes a proposal. The member sees a card and confirms it. ` +
      'Nothing changes before the member confirms.',
    parameters: z.object(def.inputSchema ?? {}).passthrough(),
    execute: async (raw: Record<string, unknown>) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'args'}: ${issue.message}`);
        return `The ${def.name} proposal was refused: ${issues.join('; ')}`;
      }
      const args = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
      try {
        const result = await draft(def.name as LabosAgentProposeTool, ctx, args, deps);
        if (typeof result === 'string') return result;
        if (result.changes.length === 0) return `The ${def.name} proposal was refused: nothing to update.`;
        const proposal: LabosAgentProposal = {
          proposalId: `ap_${randomUUID()}`,
          ...result,
          expiresAt: new Date(Date.now() + PROPOSAL_TTL_SECONDS * 1000).toISOString(),
        };
        await deps.store.save({
          proposal,
          memberUid: ctx.memberUid,
          tool: proposal.tool,
          args,
          status: 'open',
          ...(deps.threadId ? { threadId: deps.threadId } : {}),
        });
        deps.proposals.push(proposal);
        return (
          `Proposal ${proposal.proposalId} is ready: ${proposal.title}. Nothing is saved yet. ` +
          'Tell the member to check the card and confirm it.'
        );
      } catch (error) {
        return `The ${def.name} proposal failed: ${error?.message ?? error}`;
      }
    },
  });
}
