import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { PrismaService } from '../shared/prisma.service';
import { MembersService } from '../members/members.service';
import { ProjectsService } from '../projects/projects.service';
import { TeamEnrichmentService } from '../team-enrichment/team-enrichment.service';
import { TeamsService } from '../teams/teams.service';
import { McpActorContext, McpToolDef } from './mcp-tools';
import { refuseUnknown, requiredUid } from './mcp-write-tools';

function isAdmin(ctx: McpActorContext): boolean {
  return ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL);
}

async function assertTeamLead(teams: TeamsService, ctx: McpActorContext, teamUid: string) {
  if (isAdmin(ctx)) return;
  if (!(await teams.isMemberTeamLead(teamUid, ctx.memberUid))) {
    throw new ForbiddenException('Only a team lead can do that');
  }
}

async function titlesToUids(
  prisma: PrismaService,
  model: 'membershipSource' | 'communityAffiliation',
  titles: string[],
  label: string
): Promise<string[]> {
  if (titles.length === 0) return [];
  const found = await prisma[model].findMany({
    where: { OR: titles.map((title) => ({ title: { equals: title, mode: 'insensitive' as const } })) },
    select: { uid: true, title: true },
  });
  const missing = titles.filter((title) => !found.some((row) => row.title.toLowerCase() === title.toLowerCase()));
  if (missing.length > 0) throw new BadRequestException(`Unknown ${label}: ${missing.join(', ')}`);
  return found.map((row) => row.uid);
}

/** Team and project writes that update_team and update_project do not cover. */
export function directoryCoverageTools(deps: {
  teams: TeamsService;
  members: MembersService;
  projects: ProjectsService;
  prisma: PrismaService;
  participants: ParticipantsRequestService;
  enrichment: TeamEnrichmentService;
}): McpToolDef[] {
  const { teams, members, projects, prisma, participants, enrichment } = deps;
  return [
    {
      name: 'update_team_fund_profile',
      description:
        'Mark a team you lead as a fund and edit its investor profile: investment focus, startup stages, fund types, ' +
        'and typical check size. Saving investor fields also sets the team as a fund. A member who is not a lead ' +
        'or a directory admin is refused.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        teamUid: z.string(),
        isFund: z.boolean().optional(),
        investmentFocus: z.array(z.string()).optional(),
        investInStartupStages: z.array(z.string()).optional(),
        investInFundTypes: z.array(z.string()).optional(),
        typicalCheckSize: z.number().nullable().optional(),
      },
      execute: async (ctx, args = {}) => {
        const fields = [
          'teamUid',
          'isFund',
          'investmentFocus',
          'investInStartupStages',
          'investInFundTypes',
          'typicalCheckSize',
        ];
        refuseUnknown(args, fields);
        const teamUid = requiredUid(args, 'teamUid');
        const investorKeys = [
          'investmentFocus',
          'investInStartupStages',
          'investInFundTypes',
          'typicalCheckSize',
        ] as const;
        if (!('isFund' in args) && investorKeys.every((key) => !(key in args))) {
          throw new BadRequestException('Nothing to update');
        }
        if (!ctx.email) throw new ForbiddenException('Your LabOS account has no email on file.');
        await assertTeamLead(teams, ctx, teamUid);
        const team = await prisma.team.findUnique({
          where: { uid: teamUid },
          include: { investorProfile: true },
        });
        if (!team) throw new NotFoundException(`Team not found: ${teamUid}`);
        const profile = team.investorProfile;
        const body: Record<string, unknown> = { memberUid: ctx.memberUid };
        if ('isFund' in args) {
          if (typeof args.isFund !== 'boolean') throw new BadRequestException('isFund must be true or false');
          body.isFund = args.isFund;
        }
        if (investorKeys.some((key) => key in args)) {
          body.investorProfile = {
            investmentFocus: 'investmentFocus' in args ? args.investmentFocus : profile?.investmentFocus ?? [],
            investInStartupStages:
              'investInStartupStages' in args ? args.investInStartupStages : profile?.investInStartupStages ?? [],
            investInFundTypes: 'investInFundTypes' in args ? args.investInFundTypes : profile?.investInFundTypes ?? [],
            typicalCheckSize: 'typicalCheckSize' in args ? args.typicalCheckSize : profile?.typicalCheckSize ?? null,
          };
        }
        const saved = await teams.updateTeamMemberRoleAndInvestorProfile(teamUid, body as never, ctx.email);
        return { teamUid, team: saved.team };
      },
    },
    {
      name: 'update_team_membership_sources',
      description:
        'Replace the Membership Source tags on a team. Directory admins only, the same as the team page. ' +
        'Titles must already exist in LabOS.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        teamUid: z.string(),
        membershipSources: z.array(z.string()).describe('Existing membership source titles; replaces the list'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', 'membershipSources']);
        if (!isAdmin(ctx)) throw new ForbiddenException('Only directory admins can edit membership sources');
        const teamUid = requiredUid(args, 'teamUid');
        if (!Array.isArray(args.membershipSources)) throw new BadRequestException('membershipSources must be a list');
        const titles = args.membershipSources.map((title) => String(title).trim()).filter(Boolean);
        const uids = await titlesToUids(prisma, 'membershipSource', titles, 'membership sources');
        const team = await prisma.team.findUnique({ where: { uid: teamUid }, select: { uid: true } });
        if (!team) throw new NotFoundException(`Team not found: ${teamUid}`);
        await prisma.team.update({
          where: { uid: teamUid },
          data: { membershipSources: { set: uids.map((uid) => ({ uid })) } },
        });
        return { teamUid, membershipSources: titles };
      },
    },
    {
      name: 'update_team_communities',
      description: 'Replace the community affiliation tags on a team you lead. Titles must already exist in LabOS.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        teamUid: z.string(),
        communities: z.array(z.string()).describe('Existing community titles; replaces the list'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', 'communities']);
        const teamUid = requiredUid(args, 'teamUid');
        await assertTeamLead(teams, ctx, teamUid);
        if (!Array.isArray(args.communities)) throw new BadRequestException('communities must be a list');
        const titles = args.communities.map((title) => String(title).trim()).filter(Boolean);
        const uids = await titlesToUids(prisma, 'communityAffiliation', titles, 'communities');
        await prisma.team.update({
          where: { uid: teamUid },
          data: { communityAffiliations: { set: uids.map((uid) => ({ uid })) } },
        });
        return { teamUid, communities: titles };
      },
    },
    {
      name: 'update_team_roster',
      description:
        'Add or remove a member on a team you lead, set their role, or set or clear team lead. You cannot remove ' +
        'the member record itself.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        teamUid: z.string(),
        memberUid: z.string(),
        action: z.enum(['add', 'remove', 'update']),
        role: z.string().optional(),
        teamLead: z.boolean().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', 'memberUid', 'action', 'role', 'teamLead']);
        const teamUid = requiredUid(args, 'teamUid');
        const memberUid = requiredUid(args, 'memberUid');
        const action = args.action;
        if (action !== 'add' && action !== 'remove' && action !== 'update') {
          throw new BadRequestException('action must be add, remove, or update');
        }
        await assertTeamLead(teams, ctx, teamUid);
        const member = await prisma.member.findUnique({ where: { uid: memberUid }, select: { uid: true } });
        if (!member) throw new NotFoundException(`Member not found: ${memberUid}`);
        if (action === 'remove') {
          await prisma.teamMemberRole.deleteMany({ where: { teamUid, memberUid } });
          return { teamUid, memberUid, action };
        }
        const role = typeof args.role === 'string' ? args.role.trim() : undefined;
        const teamLead = typeof args.teamLead === 'boolean' ? args.teamLead : undefined;
        await prisma.teamMemberRole.upsert({
          where: { memberUid_teamUid: { memberUid, teamUid } },
          create: { memberUid, teamUid, role: role ?? null, teamLead: teamLead ?? false, roleTags: role ? [role] : [] },
          update: {
            ...(role !== undefined ? { role, roleTags: role ? [role] : [] } : {}),
            ...(teamLead !== undefined ? { teamLead } : {}),
          },
        });
        return { teamUid, memberUid, action };
      },
    },
    {
      name: 'create_team',
      description: 'Create a team the same way the signed-in team form does. You become a member of it.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        name: z.string(),
        website: z.string().optional(),
        role: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['name', 'website', 'role']);
        const name = requiredUid(args, 'name');
        if (!ctx.email) throw new ForbiddenException('Your LabOS account has no email on file.');
        const body = {
          participantType: 'TEAM',
          status: 'PENDING',
          requesterEmailId: ctx.email,
          newData: {
            name,
            website: typeof args.website === 'string' ? args.website.trim() : undefined,
            role: typeof args.role === 'string' ? args.role.trim() : undefined,
            requestorEmail: ctx.email,
          },
        };
        await participants.validateUniqueIdentifier('TEAM', name);
        await participants.validateParticipantRequest(body);
        const requester = await members.findMemberByUid(ctx.memberUid);
        const created = await participants.processImmediateRequest(body, requester);
        return { teamUid: created.uid, name };
      },
    },
    {
      name: 'delete_team',
      description: 'Hide a team from the directory. Directory admins only.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { teamUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid']);
        if (!isAdmin(ctx)) throw new ForbiddenException('Only directory admins can delete a team');
        const teamUid = requiredUid(args, 'teamUid');
        await teams.softDeleteTeam(teamUid);
        return { teamUid, deleted: true };
      },
    },
    {
      name: 'review_team_enrichment',
      description: 'Mark a team you lead as having its generated profile reviewed or approved.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { teamUid: z.string(), status: z.enum(['Reviewed', 'Approved']) },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', 'status']);
        const teamUid = requiredUid(args, 'teamUid');
        if (args.status !== 'Reviewed' && args.status !== 'Approved') {
          throw new BadRequestException('status must be Reviewed or Approved');
        }
        if (!(await teams.isMemberTeamLead(teamUid, ctx.memberUid))) {
          throw new ForbiddenException('Only team leads can review enrichment');
        }
        if (!ctx.email) throw new ForbiddenException('Your LabOS account has no email on file.');
        await enrichment.reviewEnrichment(teamUid, args.status, ctx.email);
        return { teamUid, status: args.status };
      },
    },
    {
      name: 'create_project',
      description: 'Create a project maintained by one of your teams.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        name: z.string(),
        maintainingTeamUid: z.string(),
        tagline: z.string().optional(),
        description: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['name', 'maintainingTeamUid', 'tagline', 'description']);
        const name = requiredUid(args, 'name');
        const maintainingTeamUid = requiredUid(args, 'maintainingTeamUid');
        if (!ctx.email) throw new ForbiddenException('Your LabOS account has no email on file.');
        const member = await members.findMemberByUid(ctx.memberUid);
        const onTeam = (member.teamMemberRoles ?? []).some((role) => role.teamUid === maintainingTeamUid);
        if (!isAdmin(ctx) && !onTeam)
          throw new ForbiddenException('You can only create a project for one of your teams');
        const created = await projects.createProject(
          {
            name,
            maintainingTeamUid,
            tagline: typeof args.tagline === 'string' ? args.tagline : undefined,
            description: typeof args.description === 'string' ? args.description : undefined,
            contributingTeams: [],
            contributions: [],
          } as never,
          ctx.email
        );
        return { projectUid: created?.uid ?? null, name };
      },
    },
    {
      name: 'delete_project',
      description: 'Delete a project you are allowed to delete on the project page.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { projectUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['projectUid']);
        if (!ctx.email) throw new ForbiddenException('Your LabOS account has no email on file.');
        const projectUid = requiredUid(args, 'projectUid');
        await projects.removeProjectByUid(projectUid, ctx.email);
        return { projectUid, deleted: true };
      },
    },
  ];
}
