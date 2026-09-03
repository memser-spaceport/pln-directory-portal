import { MembersService } from '../members/members.service';
import { sanitizeMemberContactsForViewer } from '../members/member-contact-sanitizer';
import { presentJobSearchStatusForViewer } from '../members/job-search-status';
import { McpActorContext } from './mcp-tools';

type Row = Record<string, unknown>;

const SNIPPET_MAX_LENGTH = 240;

function recordArg(value: unknown): Row | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Row;
}

function arrayArg(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

export function compactMemberRow(member: Row): Row {
  const mainTeamRole = arrayArg(member.teamMemberRoles).find((role) => role.mainTeam === true);
  const location = recordArg(member.location);
  return {
    uid: member.uid,
    name: member.name,
    image: recordArg(member.image)?.url ?? null,
    mainTeam: recordArg(mainTeamRole?.team)?.name ?? null,
    location: location ? { city: location.city ?? null, country: location.country ?? null } : null,
  };
}

export function compactTeamRow(team: Row): Row {
  return {
    uid: team.uid,
    name: team.name,
    image: recordArg(team.logo)?.url ?? null,
    shortDescription: team.shortDescription ?? null,
  };
}

export function compactProjectRow(project: Row): Row {
  return {
    uid: project.uid,
    name: project.name,
    image: recordArg(project.logo)?.url ?? null,
    tagline: project.tagline ?? null,
  };
}

export function compactEventRow(event: Row): Row {
  return {
    uid: event.uid,
    name: event.name,
    image: recordArg(event.logo)?.url ?? null,
    slugURL: event.slugURL ?? null,
    startDate: event.startDate ?? null,
    endDate: event.endDate ?? null,
    location: recordArg(event.location)?.location ?? null,
  };
}

export function compactForumThreadRow(hit: Row): Row {
  const rootPost = recordArg(hit.rootPost);
  const content = typeof rootPost?.content === 'string' ? rootPost.content.trim() : '';
  const snippet = content.length > SNIPPET_MAX_LENGTH ? `${content.slice(0, SNIPPET_MAX_LENGTH)}…` : content || null;
  return {
    uid: hit.tid != null ? String(hit.tid) : null,
    topicTitle: hit.topicTitle ?? null,
    topicSlug: hit.topicSlug ?? null,
    topicUrl: hit.topicUrl ?? null,
    replyCount: typeof hit.replyCount === 'number' ? hit.replyCount : 0,
    cid: hit.cid ?? null,
    snippet,
  };
}

export function formatMemberForViewer(member: Row, canSeeJobSearchStatus: boolean): Row {
  const sanitized = sanitizeMemberContactsForViewer({ ...member }, true);
  return presentJobSearchStatusForViewer(sanitized, canSeeJobSearchStatus);
}

export async function canViewJobSearchStatus(
  members: MembersService,
  ctx: McpActorContext,
  targetMemberUid: string
): Promise<boolean> {
  if (ctx.memberUid === targetMemberUid) {
    return true;
  }
  if (!ctx.email) {
    return false;
  }
  const requestor = await members.findMemberByEmail(ctx.email);
  return requestor?.isDirectoryAdmin === true;
}

export function formatTeamForViewer(team: Row): Row {
  return sanitizeMemberContactsForViewer({ ...team }, true);
}

export function formatProjectForViewer(project: Row): Row {
  return sanitizeMemberContactsForViewer({ ...project }, true);
}
